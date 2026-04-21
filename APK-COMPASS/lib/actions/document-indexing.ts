'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Document Indexing & Search for AI Assistant
// Przeszukiwanie dokumentów (app_documents + knowledge base)
// ============================================================

export interface DocumentSearchResult {
    id: string
    title: string
    category: string
    description: string | null
    text_content: string | null
    is_public: boolean
    relevance: number
}

/**
 * Search documents using PostgreSQL full-text search (Polish stemming).
 * Returns documents accessible by the user's role.
 */
export async function searchDocumentsForAI(
    query: string,
    userRole: string = 'consultant',
    maxResults: number = 5
): Promise<DocumentSearchResult[]> {
    const supabase = createClient()

    // Try RPC first (full-text search function)
    const { data: rpcData, error: rpcError } = await supabase.rpc('search_documents_for_ai', {
        search_query: query,
        user_role: userRole,
        max_results: maxResults,
    })

    if (!rpcError && rpcData && rpcData.length > 0) {
        return rpcData
    }

    // Fallback: simple ILIKE search if RPC not available
    const { data: fallbackData } = await supabase
        .from('app_documents')
        .select('id, title, category, description, text_content, is_public')
        .eq('is_archived', false)
        .not('text_content', 'is', null)
        .or(`title.ilike.%${query}%,text_content.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(maxResults)

    return (fallbackData || []).map(d => ({
        ...d,
        relevance: 0.5,
    }))
}

/**
 * Get all knowledge base documents (compass_assist_knowledge)
 * that match the query via simple text search.
 * Fallback when vector search is not available.
 */
export async function searchKnowledgeBaseSimple(
    query: string,
    maxResults: number = 5
): Promise<{ id: string; content: string; category: string }[]> {
    const supabase = createClient()

    const { data, error } = await supabase
        .from('compass_assist_knowledge')
        .select('id, content, category')
        .or(`content.ilike.%${query}%`)
        .limit(maxResults)

    if (error) {
        // Table might not exist yet
        console.warn('Knowledge base search failed:', error.message)
        return []
    }

    return data || []
}

/**
 * Build AI context from all document sources.
 * Called by AI Assistant before answering user questions.
 * Enhanced: reads ALL documents when question is about documents/regulations,
 * and uses larger context window for detailed answers.
 */
export async function buildDocumentContext(
    userQuestion: string,
    userRole: string
): Promise<string> {
    const questionLower = userQuestion.toLowerCase()

    // Detect if user is asking about documents/regulations broadly
    const isDocumentQuery = /dokument|regulamin|umow|procedur|zasad|polityk|instrukcj|wiedz|baz|treść|zawartość|przeczytaj|pokaż|znajdź.*dok/i.test(questionLower)

    // Extract key terms for search (simple: take longest words)
    const searchTerms = extractSearchTerms(userQuestion)
    if (!searchTerms && !isDocumentQuery) return ''

    const contextParts: string[] = []

    // 1. Search app_documents (user-uploaded docs) — more results for document queries
    try {
        const maxDocs = isDocumentQuery ? 8 : 5
        const docs = searchTerms
            ? await searchDocumentsForAI(searchTerms, userRole, maxDocs)
            : []

        // If document query but no search results, fetch recent documents
        if (isDocumentQuery && docs.length === 0) {
            const allDocs = await getAllDocumentsForAI(userRole, 8)
            if (allDocs.length > 0) {
                contextParts.push('WSZYSTKIE DOKUMENTY W SYSTEMIE:')
                for (const doc of allDocs) {
                    const content = doc.text_content
                        ? doc.text_content.substring(0, 2000)
                        : '(brak treści tekstowej)'
                    contextParts.push(
                        `--- [${doc.category.toUpperCase()}] ${doc.title} ---\n${doc.description ? doc.description + '\n' : ''}${content}`
                    )
                }
            }
        } else if (docs.length > 0) {
            contextParts.push('DOKUMENTY W SYSTEMIE:')
            for (const doc of docs) {
                const content = doc.text_content
                    ? doc.text_content.substring(0, 2000)
                    : '(brak treści tekstowej)'
                contextParts.push(
                    `--- [${doc.category.toUpperCase()}] ${doc.title} ---\n${doc.description ? doc.description + '\n' : ''}${content}`
                )
            }
        }
    } catch (e) {
        // Silently fail if app_documents not ready
        console.warn('Document search failed:', e)
    }

    // 2. Search knowledge base (compass_assist_knowledge) — more results
    try {
        const maxKnowledge = isDocumentQuery ? 6 : 4
        const knowledge = searchTerms
            ? await searchKnowledgeBaseSimple(searchTerms, maxKnowledge)
            : await searchKnowledgeBaseSimple(questionLower.substring(0, 50), maxKnowledge)

        if (knowledge.length > 0) {
            contextParts.push('\nBAZA WIEDZY:')
            for (const k of knowledge) {
                contextParts.push(`--- [${k.category}] ---\n${k.content.substring(0, 2000)}`)
            }
        }
    } catch (e) {
        console.warn('Knowledge base search failed:', e)
    }

    // 3. Also fetch any public/regulation documents (always relevant)
    try {
        const supabase = createClient()
        const { data: publicDocs } = await supabase
            .from('app_documents')
            .select('title, category, text_content, description')
            .eq('is_archived', false)
            .eq('is_public', true)
            .or('category.eq.regulation,category.eq.procedure,category.eq.policy')
            .not('text_content', 'is', null)
            .limit(5)

        if (publicDocs && publicDocs.length > 0) {
            const alreadyIncluded = contextParts.join('')
            for (const doc of publicDocs) {
                // Avoid duplicates
                if (!alreadyIncluded.includes(doc.title)) {
                    contextParts.push(
                        `\n--- [${doc.category.toUpperCase()}] ${doc.title} ---\n${doc.text_content?.substring(0, 1500) || ''}`
                    )
                }
            }
        }
    } catch (e) {
        // Silently fail
    }

    if (contextParts.length === 0) return ''

    // Limit total context to ~8000 chars for detailed document reading
    const maxContextLength = isDocumentQuery ? 8000 : 5000
    let fullContext = contextParts.join('\n')
    if (fullContext.length > maxContextLength) {
        fullContext = fullContext.substring(0, maxContextLength) + '\n... (skrócono do limitu kontekstu)'
    }

    return fullContext
}

/**
 * Fetch all accessible documents (without search filter).
 * Used when user asks broadly about documents.
 */
async function getAllDocumentsForAI(
    userRole: string,
    maxResults: number = 8
): Promise<DocumentSearchResult[]> {
    const supabase = createClient()

    const query = supabase
        .from('app_documents')
        .select('id, title, category, description, text_content, is_public')
        .eq('is_archived', false)
        .not('text_content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(maxResults)

    // Consultants only see public docs
    if (userRole === 'consultant') {
        query.eq('is_public', true)
    }

    const { data, error } = await query

    if (error) {
        console.warn('getAllDocumentsForAI failed:', error.message)
        return []
    }

    return (data || []).map(d => ({
        ...d,
        relevance: 0.3,
    }))
}

/**
 * Index a document's text content (called after upload).
 * Extracts text from filename/title and saves to text_content.
 */
export async function indexDocumentText(
    documentId: string,
    textContent: string,
    description?: string
): Promise<boolean> {
    const supabase = createClient()

    const updateData: Record<string, any> = {
        text_content: textContent,
        ai_indexed: true,
        ai_indexed_at: new Date().toISOString(),
    }

    if (description) {
        updateData.description = description
    }

    const { error } = await supabase
        .from('app_documents')
        .update(updateData)
        .eq('id', documentId)

    if (error) {
        console.error('Failed to index document:', error.message)
        return false
    }

    return true
}

/**
 * Extract meaningful search terms from user question.
 * Removes stop words and keeps important nouns/keywords.
 */
function extractSearchTerms(question: string): string {
    const stopWords = new Set([
        'czy', 'jak', 'co', 'to', 'jest', 'są', 'w', 'na', 'z', 'do', 'od',
        'dla', 'o', 'i', 'a', 'ale', 'że', 'nie', 'się', 'mi', 'mnie', 'ten',
        'ta', 'te', 'tym', 'tego', 'tej', 'tych', 'gdzie', 'kiedy', 'jaki',
        'jaka', 'jakie', 'ile', 'kto', 'czym', 'po', 'przez', 'przy', 'ze',
        'mam', 'mogę', 'chcę', 'proszę', 'powiedz', 'podaj', 'napisz',
        'about', 'the', 'and', 'is', 'are', 'what', 'how', 'can', 'my',
    ])

    const words = question
        .toLowerCase()
        .replace(/[?!.,;:()]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w))

    // Return top keywords (max 5)
    return words.slice(0, 5).join(' ')
}
