'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { indexDocumentText } from './document-indexing'

export type DocumentCategory = 'contract' | 'invoice' | 'certificate' | 'onboarding' | 'benefit' | 'regulation' | 'other'

/** Sanitize filename for Supabase Storage — remove diacritics, spaces, special chars */
function sanitizeFileName(name: string): string {
    // Normalize Unicode (NFD) to split base chars from diacritics, then strip diacritics
    const withoutDiacritics = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Replace spaces and unsafe chars with underscores, keep only alphanumeric, dots, hyphens, underscores
    return withoutDiacritics
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
}

export async function uploadNewDocument(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const category = (formData.get('category') as DocumentCategory) || 'other'
    const changeSummary = formData.get('changeSummary') as string | null
    const isPublic = formData.get('isPublic') === 'true'

    if (!file || !title) throw new Error('File and title are required')

    // If public, check permissions
    if (isPublic) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (!['admin', 'administrator', 'centrala'].includes(profile?.role || '')) {
            throw new Error('Only admins can upload public documents')
        }
    }

    // 1. Upload to Storage
    const safeFileName = sanitizeFileName(file.name)
    let filePath = ''
    if (isPublic) {
        filePath = `public/${Date.now()}_${safeFileName}`
    } else {
        filePath = `app-docs/${user.id}/${Date.now()}_${safeFileName}`
    }

    const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // 2. Create Master Record (app_documents)
    const { data: doc, error: docError } = await supabase
        .from('app_documents')
        .insert({
            owner_id: user.id,
            title,
            category,
            current_status: 'active',
            is_public: isPublic
        })
        .select()
        .single()

    if (docError) throw new Error(`Database error (master): ${docError.message}`)

    // 3. Create Version Record
    const { error: verError } = await supabase
        .from('document_versions')
        .insert({
            document_id: doc.id,
            version_number: 1,
            file_url: filePath,
            file_name: file.name,
            file_size: file.size,
            uploaded_by: user.id,
            change_summary: changeSummary || 'Wersja początkowa'
        })

    if (verError) throw new Error(`Database error (version): ${verError.message}`)

    // AI Indexing — extract text content for AI Assistant search
    try {
        const textContent = await extractTextFromFile(file)
        if (textContent) {
            await indexDocumentText(doc.id, textContent, changeSummary || undefined)
        }
    } catch (e) {
        // Non-critical — don't fail upload if indexing fails
        console.warn('AI indexing skipped:', e)
    }

    revalidatePath('/documents')
    revalidatePath('/centrala')
    revalidatePath('/admin/centrala')
    return { success: true, documentId: doc.id }
}

export async function uploadNewVersion(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const documentId = formData.get('documentId') as string
    const file = formData.get('file') as File
    const changeSummary = formData.get('changeSummary') as string | null

    if (!documentId || !file) throw new Error('Document ID and file are required')

    // Get current document to check ownership/permissions
    const { data: doc, error: docError } = await supabase
        .from('app_documents')
        .select('*, versions:document_versions(*)')
        .eq('id', documentId)
        .single()

    if (docError || !doc) throw new Error('Document not found')

    // For public docs, check admin permissions
    if (doc.is_public) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (!['admin', 'administrator', 'centrala'].includes(profile?.role || '')) {
            throw new Error('Only admins can update public documents')
        }
    } else if (doc.owner_id !== user.id) {
        throw new Error('You can only update your own documents')
    }

    // Determine next version number
    const currentMaxVersion = doc.versions?.reduce((max: number, v: any) => Math.max(max, v.version_number), 0) || 0
    const nextVersion = currentMaxVersion + 1

    // Upload file to storage
    const safeFileName = sanitizeFileName(file.name)
    let filePath = ''
    if (doc.is_public) {
        filePath = `public/${Date.now()}_${safeFileName}`
    } else {
        filePath = `app-docs/${user.id}/${Date.now()}_${safeFileName}`
    }

    const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // Create version record
    const { error: verError } = await supabase
        .from('document_versions')
        .insert({
            document_id: documentId,
            version_number: nextVersion,
            file_url: filePath,
            file_name: file.name,
            file_size: file.size,
            uploaded_by: user.id,
            change_summary: changeSummary || `Wersja ${nextVersion}`
        })

    if (verError) throw new Error(`Database error (version): ${verError.message}`)

    // Update the document's updated_at
    await supabase
        .from('app_documents')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', documentId)

    revalidatePath('/documents')
    revalidatePath('/centrala')
    revalidatePath('/admin/centrala')
    return { success: true, versionNumber: nextVersion }
}

export async function archiveDocument(documentId: string) {
    const supabase = await createClient()

    // Soft delete (archive)
    const { error } = await supabase
        .from('app_documents')
        .update({ is_archived: true, current_status: 'archived' })
        .eq('id', documentId)

    if (error) throw new Error(`Archiving failed: ${error.message}`)

    revalidatePath('/documents')
    revalidatePath('/centrala')
    revalidatePath('/admin/centrala')
    return { success: true }
}

export async function deleteDocument(documentId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Fetch doc with all versions to get file paths for storage cleanup
    const { data: doc, error: fetchError } = await supabase
        .from('app_documents')
        .select('*, versions:document_versions(*)')
        .eq('id', documentId)
        .single()

    if (fetchError || !doc) throw new Error('Document not found')

    // Check permissions: owner or admin
    if (doc.owner_id !== user.id) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (!['admin', 'administrator', 'centrala'].includes(profile?.role || '')) {
            throw new Error('Unauthorized to delete this document')
        }
    }

    // Delete files from Storage
    const filePaths = (doc.versions || []).map((v: any) => v.file_url).filter(Boolean)
    if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
            .from('documents')
            .remove(filePaths)
        if (storageError) {
            console.error('Storage cleanup warning:', storageError.message)
        }
    }

    // Hard delete from database (cascade will remove versions)
    const { error } = await supabase
        .from('app_documents')
        .delete()
        .eq('id', documentId)

    if (error) throw new Error(`Delete failed: ${error.message}`)

    revalidatePath('/documents')
    revalidatePath('/centrala')
    revalidatePath('/admin/centrala')
    return { success: true }
}

export async function getUnifiedDocuments(ownerId?: string, isPublic: boolean = false, category?: DocumentCategory) {
    const supabase = await createClient()

    let query = supabase
        .from('app_documents')
        .select(`
            *,
            versions:document_versions(*)
        `)

    if (isPublic) {
        query = query.eq('is_public', true)
    } else if (ownerId) {
        query = query.eq('owner_id', ownerId).eq('is_public', false)
    }

    if (category) {
        query = query.eq('category', category)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
        console.error('Fetch error:', error)
        return []
    }

    // Map to include a shorthand for the latest version
    return data.map(doc => ({
        ...doc,
        latest_version: doc.versions?.sort((a: any, b: any) => b.version_number - a.version_number)[0]
    }))
}

// ============================================================
// AI Document Indexing — Text Extraction
// ============================================================

const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.log']

/**
 * Extract text content from uploaded file.
 * Supports: text files (txt, md, csv, json, xml, html), metadata for others.
 * For PDFs and DOCX — returns title/metadata only (server-side extraction can be added later).
 */
async function extractTextFromFile(file: File): Promise<string | null> {
    const fileName = file.name.toLowerCase()
    const extension = '.' + fileName.split('.').pop()

    // Text-based files — read directly
    if (TEXT_EXTENSIONS.includes(extension)) {
        try {
            const text = await file.text()
            // Limit to 10,000 chars for indexing
            return text.substring(0, 10000)
        } catch {
            return null
        }
    }

    // PDF, DOCX etc — store basic metadata for now
    // Full text extraction can be added via external service or Edge Function
    if (extension === '.pdf' || extension === '.docx' || extension === '.doc') {
        return `[Plik ${extension.toUpperCase()}] ${file.name} (${formatFileSize(file.size)}). Pełna ekstrakcja tekstu wymaga przetworzenia.`
    }

    // Images, spreadsheets, etc — just filename metadata
    return `[Plik] ${file.name} (${formatFileSize(file.size)})`
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Re-index a specific document with new text content.
 * Useful for admin batch operations or manual re-indexing.
 */
export async function reindexDocument(documentId: string, textContent: string, description?: string) {
    return indexDocumentText(documentId, textContent, description)
}

/**
 * Batch re-index all documents that haven't been indexed yet.
 * Admin-only operation.
 */
export async function reindexAllDocuments() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'administrator'].includes(profile?.role || '')) {
        throw new Error('Admin only')
    }

    // Find documents without text_content
    const { data: unindexed } = await supabase
        .from('app_documents')
        .select('id, title, category')
        .is('text_content', null)
        .eq('is_archived', false)

    if (!unindexed || unindexed.length === 0) {
        return { indexed: 0, message: 'Wszystkie dokumenty są już zaindeksowane.' }
    }

    let indexed = 0
    for (const doc of unindexed) {
        // For documents without file text, index at least title + category
        const basicText = `${doc.title} — Kategoria: ${doc.category}`
        const success = await indexDocumentText(doc.id, basicText)
        if (success) indexed++
    }

    return { indexed, total: unindexed.length, message: `Zaindeksowano ${indexed} z ${unindexed.length} dokumentów.` }
}
