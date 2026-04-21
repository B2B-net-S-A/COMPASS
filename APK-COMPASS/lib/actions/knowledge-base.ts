'use server'

import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'MISSING_KEY',
})

export type KnowledgeDocument = {
    id: string
    content: string
    category: string
    metadata: Record<string, any>
    created_at: string
}

export async function createEmbedding(text: string) {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    })
    return response.data[0].embedding
}

export async function addKnowledgeDocument(content: string, category: string, metadata: Record<string, any> = {}) {
    const supabase = createClient()
    const embedding = await createEmbedding(content.replace(/\n/g, ' '))

    const { data, error } = await supabase
        .from('compass_assist_knowledge')
        .insert({
            content,
            category,
            metadata,
            embedding
        })
        .select()
        .single()

    if (error) {
        console.error('addKnowledgeDocument error:', error.code, error.message)
        throw new Error(`Failed to add knowledge: ${error.message} (code: ${error.code})`)
    }
    return data
}

export async function getKnowledgeHistory(category?: string) {
    const supabase = createClient()
    // Explicitly select columns WITHOUT embedding (vector(1536) is too large for serialization)
    let query = supabase
        .from('compass_assist_knowledge')
        .select('id, content, category, metadata, created_at, updated_at')
        .order('created_at', { ascending: false })

    if (category) {
        query = query.eq('category', category)
    }

    const { data, error } = await query
    if (error) {
        console.error('getKnowledgeHistory error:', error)
        throw new Error(`Failed to fetch knowledge: ${error.message}`)
    }
    return data || []
}

export async function deleteKnowledgeDocument(id: string) {
    const supabase = createClient()
    const { error } = await supabase
        .from('compass_assist_knowledge')
        .delete()
        .eq('id', id)

    if (error) throw new Error(`Failed to delete knowledge: ${error.message}`)
    return { success: true }
}

/**
 * Upload PDF or DOCX file → parse text → split into chunks → index each chunk with embeddings
 */
export async function uploadKnowledgeFile(
    formData: FormData,
    category: string
): Promise<{ success: boolean; chunksIndexed: number; fileName: string; error?: string }> {
    const file = formData.get('file') as File
    if (!file) return { success: false, chunksIndexed: 0, fileName: '', error: 'Brak pliku' }

    const fileName = file.name
    const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]

    if (!allowedTypes.includes(file.type) && !fileName.endsWith('.pdf') && !fileName.endsWith('.docx')) {
        return { success: false, chunksIndexed: 0, fileName, error: 'Dozwolone formaty: PDF, DOCX' }
    }

    if (file.size > 20 * 1024 * 1024) {
        return { success: false, chunksIndexed: 0, fileName, error: 'Maksymalny rozmiar pliku: 20MB' }
    }

    try {
        // 1. Parse file to text
        const buffer = Buffer.from(await file.arrayBuffer())
        const { parseBuffer } = await import('@/lib/files/parsers')
        const rawText = await parseBuffer(buffer, file.type, fileName)

        if (!rawText || rawText.trim().length < 50) {
            return { success: false, chunksIndexed: 0, fileName, error: 'Nie udało się wyodrębnić tekstu z pliku (zbyt krótki lub pusty)' }
        }

        // 2. Split text into chunks (~1500 chars each, overlap 200)
        const chunks = splitTextIntoChunks(rawText, 1500, 200)

        // 3. Index each chunk
        const supabase = createClient()
        let indexed = 0

        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i].trim()
            if (chunkText.length < 30) continue // Skip very short chunks

            try {
                const embedding = await createEmbedding(chunkText.replace(/\n/g, ' '))

                const { error: insertError } = await supabase
                    .from('compass_assist_knowledge')
                    .insert({
                        content: chunkText,
                        category,
                        metadata: {
                            source_file: fileName,
                            file_type: fileName.endsWith('.pdf') ? 'pdf' : 'docx',
                            chunk_index: i,
                            total_chunks: chunks.length,
                            file_size: file.size,
                            uploaded_at: new Date().toISOString()
                        },
                        embedding
                    })

                if (insertError) {
                    console.error(`Insert error chunk ${i}:`, insertError.message, insertError.code)
                    // If first chunk fails with RLS/permission error, bail early
                    if (i === 0 && (insertError.code === '42501' || insertError.message.includes('policy'))) {
                        return { success: false, chunksIndexed: 0, fileName, error: `Brak uprawnień do zapisu w bazie wiedzy (RLS). Kod: ${insertError.code}` }
                    }
                } else {
                    indexed++
                }
            } catch (embErr: any) {
                console.error(`Error indexing chunk ${i}:`, embErr)
                if (i === 0) {
                    return { success: false, chunksIndexed: 0, fileName, error: `Błąd indeksowania: ${embErr.message}` }
                }
            }
        }

        return { success: true, chunksIndexed: indexed, fileName }
    } catch (err: any) {
        console.error('Upload knowledge file error:', err)
        return { success: false, chunksIndexed: 0, fileName, error: err.message || 'Błąd przetwarzania pliku' }
    }
}

/**
 * Split text into overlapping chunks for better RAG retrieval
 */
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
        let end = start + chunkSize

        // Try to break at a sentence boundary
        if (end < text.length) {
            const lastPeriod = text.lastIndexOf('.', end)
            const lastNewline = text.lastIndexOf('\n', end)
            const breakPoint = Math.max(lastPeriod, lastNewline)
            if (breakPoint > start + chunkSize * 0.5) {
                end = breakPoint + 1
            }
        }

        chunks.push(text.slice(start, end))
        start = end - overlap
    }

    return chunks
}

export async function searchKnowledge(query: string, category?: string) {
    const supabase = createClient()
    const embedding = await createEmbedding(query.replace(/\n/g, ' '))

    const { data, error } = await supabase.rpc('match_assist_knowledge', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 5,
        filter_category: category || null
    })

    if (error) throw new Error(`Search failed: ${error.message}`)
    return data
}
