'use server'

// Phase 27i — Contract documents (umowa + aneksy) per employee. Finanse + admin only.
// Files live in the private 'contract-documents' bucket (folder = {user_id}/); metadata
// rows in user_contract_documents. Upload/download go through the service-role client
// (authz enforced here); storage RLS is defense-in-depth.

import { logCompat } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireFinanseOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import type { ContractDocument, ContractDocType } from '@/lib/types/rates'
import { CONTRACT_DOC_ALLOWED_MIME, CONTRACT_DOC_MAX_BYTES } from '@/lib/types/rates'

const BUCKET = 'contract-documents'
const SIGNED_URL_TTL_SECONDS = 60
const DOC_COLUMNS =
    'id, user_id, doc_type, description, signed_date, file_name, file_size_bytes, file_mime, uploaded_by, created_at'
const ALLOWED_DOC_TYPES: readonly ContractDocType[] = ['umowa', 'aneks', 'inne']

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

/** List all contract documents for an employee (finanse + admin). */
export async function listContractDocuments(userId: string): Promise<ContractDocument[]> {
    await requireFinanseOrAdminAction()
    if (!userId) throw new Error('Brak user_id.')
    const admin = createServiceClient()
    const { data, error } = await admin
        // user_contract_documents not yet in database.types.ts — cast table name.
        .from('user_contract_documents')
        .select(DOC_COLUMNS)
        .eq('user_id', userId)
        .order('signed_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
    if (error) throw new Error(`Błąd pobierania dokumentów: ${error.message}`)
    return ((data ?? []) as unknown) as ContractDocument[]
}

/** Upload a contract document for an employee (finanse + admin). */
export async function uploadContractDocument(
    userId: string,
    file: File,
    docType: ContractDocType,
    description: string | null,
    signedDate: string | null,
): Promise<ContractDocument> {
    const ctx = await requireFinanseOrAdminAction()
    if (!userId) throw new Error('Brak user_id.')
    if (!file || !(file instanceof File)) throw new Error('Brak pliku.')
    if (file.size === 0) throw new Error('Plik jest pusty.')
    if (file.size > CONTRACT_DOC_MAX_BYTES) {
        throw new Error(`Plik za duży (max ${CONTRACT_DOC_MAX_BYTES / 1024 / 1024} MB).`)
    }
    const mime = file.type || 'application/octet-stream'
    if (!CONTRACT_DOC_ALLOWED_MIME.includes(mime as (typeof CONTRACT_DOC_ALLOWED_MIME)[number])) {
        throw new Error(`Niedozwolony typ pliku (${mime}). Dozwolone: PDF, JPG, PNG, WEBP, DOCX.`)
    }
    if (!ALLOWED_DOC_TYPES.includes(docType)) throw new Error('Niedozwolony typ dokumentu.')
    if (signedDate && !/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) {
        throw new Error('Data podpisania musi być w formacie YYYY-MM-DD.')
    }
    if (description && description.length > 500) throw new Error('Opis za długi (max 500 znaków).')

    const admin = createServiceClient()

    const { data: target, error: targetErr } = await admin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single<{ id: string }>()
    if (targetErr || !target) throw new Error('Pracownik nie istnieje.')

    const timestamp = Date.now()
    const path = `${userId}/${timestamp}_${sanitizeFilename(file.name)}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: mime, upsert: false })
    if (uploadErr) throw new Error(`Błąd uploadu: ${uploadErr.message}`)

    const { data: inserted, error: insErr } = await admin
        .from('user_contract_documents')
        .insert({
            user_id: userId,
            doc_type: docType,
            description: description?.trim() || null,
            signed_date: signedDate || null,
            file_path: path,
            file_name: file.name,
            file_size_bytes: file.size,
            file_mime: mime,
            uploaded_by: ctx.userId,
        })
        .select(DOC_COLUMNS)
        .single<ContractDocument>()
    if (insErr || !inserted) {
        await admin.storage.from(BUCKET).remove([path]).catch(() => undefined)
        throw new Error(`Błąd zapisu dokumentu: ${insErr?.message ?? 'unknown'}`)
    }

    await logAudit(ctx.userId, 'CONTRACT_DOCUMENT_UPLOADED', {
        document_id: inserted.id,
        target_user_id: userId,
        doc_type: docType,
        filename: file.name,
        size_bytes: file.size,
        signed_date: signedDate || null,
    })

    return inserted
}

/** Short-lived signed URL for downloading a contract document (finanse + admin). */
export async function getContractDocumentSignedUrl(documentId: string): Promise<string> {
    await requireFinanseOrAdminAction()
    if (!documentId) throw new Error('Brak id dokumentu.')
    const admin = createServiceClient()
    const { data: doc, error } = await admin
        .from('user_contract_documents')
        .select('file_path')
        .eq('id', documentId)
        .single<{ file_path: string }>()
    if (error || !doc) throw new Error('Dokument nie znaleziony.')
    const { data: signed, error: signErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) {
        throw new Error(`Błąd generowania linka: ${signErr?.message ?? 'unknown'}`)
    }
    return signed.signedUrl
}

/** Delete a contract document — removes the file and the metadata row (finanse + admin). */
export async function deleteContractDocument(documentId: string): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()
    if (!documentId) throw new Error('Brak id dokumentu.')
    const admin = createServiceClient()
    const { data: doc, error } = await admin
        .from('user_contract_documents')
        .select('id, user_id, file_path, file_name')
        .eq('id', documentId)
        .single<{ id: string; user_id: string; file_path: string; file_name: string }>()
    if (error || !doc) throw new Error('Dokument nie znaleziony.')

    const { error: rmErr } = await admin.storage.from(BUCKET).remove([doc.file_path])
    if (rmErr) logCompat.error('[deleteContractDocument] storage remove failed:', rmErr)

    const { error: delErr } = await admin
        .from('user_contract_documents')
        .delete()
        .eq('id', documentId)
    if (delErr) throw new Error(`Błąd usuwania dokumentu: ${delErr.message}`)

    await logAudit(ctx.userId, 'CONTRACT_DOCUMENT_DELETED', {
        document_id: documentId,
        target_user_id: doc.user_id,
        filename: doc.file_name,
    })
}
