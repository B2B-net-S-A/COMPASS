'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Index a document's text content (called after upload).
 * Saves text_content + ai_indexed marker so future search/feature can read pre-extracted text
 * without re-parsing the file blob.
 */
export async function indexDocumentText(
    documentId: string,
    textContent: string,
    description?: string
): Promise<boolean> {
    const supabase = createClient()

    const updateData: Record<string, unknown> = {
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
