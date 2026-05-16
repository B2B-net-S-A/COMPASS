'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth/require-super-admin'
import { logCompat } from '@/lib/logger'
import {
    ALLOWED_MATERIAL_MIME,
    MAX_MATERIAL_SIZE_BYTES,
    type ArticleAttachment,
    type CategoryMaterial,
    type SupportActionResult,
} from '@/lib/types/support'

const BUCKET = 'support-materials'

function sanitizeFileName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
}

function validateFile(file: File): string | null {
    if (!file || file.size === 0) return 'Pusty plik.'
    if (file.size > MAX_MATERIAL_SIZE_BYTES) return `Plik za duży (max ${MAX_MATERIAL_SIZE_BYTES / 1024 / 1024} MB).`
    if (!ALLOWED_MATERIAL_MIME.includes(file.type as (typeof ALLOWED_MATERIAL_MIME)[number])) {
        return `Niedozwolony typ pliku (${file.type}). Dozwolone: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, obrazy, TXT/CSV.`
    }
    return null
}

// ─── Category materials ──────────────────────────────────────────────────────

export async function listCategoryMaterials(categoryId: string): Promise<SupportActionResult<CategoryMaterial[]>> {
    try {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('support_category_materials')
            .select('*')
            .eq('category_id', categoryId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false })
        if (error) throw error
        return { success: true, data: (data ?? []) as CategoryMaterial[] }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania materiałów'
        return { success: false, error: msg }
    }
}

// Client-callable wrapper. Next.js 14 + React 18 nie serializuje File jako
// argumentu Server Action ("Only plain objects, and a few built-ins, can be
// passed to Server Actions"). Klient pakuje wszystko do FormData; tu
// rozpakowujemy i wołamy `uploadCategoryMaterial`.
export async function uploadCategoryMaterialForm(
    formData: FormData,
): Promise<SupportActionResult<CategoryMaterial>> {
    const categoryId = String(formData.get('category_id') ?? '')
    if (!categoryId) return { success: false, error: 'Brak ID kategorii.' }
    const file = formData.get('file')
    if (!(file instanceof File)) return { success: false, error: 'Plik jest wymagany.' }
    const title = String(formData.get('title') ?? '')
    const rawDescription = formData.get('description')
    const description =
        typeof rawDescription === 'string' && rawDescription.length > 0 ? rawDescription : undefined
    return uploadCategoryMaterial(categoryId, file, title, description)
}

export async function uploadCategoryMaterial(
    categoryId: string,
    file: File,
    title: string,
    description?: string,
): Promise<SupportActionResult<CategoryMaterial>> {
    try {
        const { supabase, user } = await requireSuperAdmin()
        if (!title || title.trim().length < 2) return { success: false, error: 'Tytuł musi mieć co najmniej 2 znaki.' }
        const fileErr = validateFile(file)
        if (fileErr) return { success: false, error: fileErr }

        const safeName = sanitizeFileName(file.name)
        const filePath = `materials/${categoryId}/${Date.now()}_${safeName}`

        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(filePath, file, {
            contentType: file.type,
            upsert: false,
        })
        if (uploadErr) throw new Error(`Upload nie powiódł się: ${uploadErr.message}`)

        const { data, error } = await supabase
            .from('support_category_materials')
            .insert({
                category_id: categoryId,
                title: title.trim(),
                description: description?.trim() || null,
                file_path: filePath,
                file_name: file.name,
                file_size: file.size,
                mime_type: file.type,
                uploaded_by: user.id,
            })
            .select('*')
            .single()
        if (error || !data) {
            await supabase.storage.from(BUCKET).remove([filePath]).catch((e) =>
                logCompat.error('[uploadCategoryMaterial] cleanup failed:', e),
            )
            throw new Error(`Zapis metadanych nie powiódł się: ${error?.message ?? 'unknown'}`)
        }

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb/categories')
        return { success: true, data: data as CategoryMaterial }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd uploadu materiału'
        logCompat.error('[uploadCategoryMaterial]', error)
        return { success: false, error: msg }
    }
}

export async function deleteCategoryMaterial(id: string): Promise<SupportActionResult<true>> {
    try {
        const { supabase } = await requireSuperAdmin()
        const { data: existing, error: fetchErr } = await supabase
            .from('support_category_materials')
            .select('file_path')
            .eq('id', id)
            .single()
        if (fetchErr || !existing) return { success: false, error: 'Materiał nie istnieje.' }

        const { error: deleteRowErr } = await supabase.from('support_category_materials').delete().eq('id', id)
        if (deleteRowErr) throw deleteRowErr

        await supabase.storage.from(BUCKET).remove([existing.file_path]).catch((e) =>
            logCompat.error('[deleteCategoryMaterial] storage cleanup failed:', e),
        )

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb/categories')
        return { success: true, data: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd usuwania materiału'
        return { success: false, error: msg }
    }
}

// ─── Article attachments ─────────────────────────────────────────────────────

export async function listArticleAttachments(articleId: string): Promise<SupportActionResult<ArticleAttachment[]>> {
    try {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('support_article_attachments')
            .select('*')
            .eq('article_id', articleId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false })
        if (error) throw error
        return { success: true, data: (data ?? []) as ArticleAttachment[] }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania załączników'
        return { success: false, error: msg }
    }
}

// Client-callable wrapper — patrz komentarz przy `uploadCategoryMaterialForm`.
export async function uploadArticleAttachmentForm(
    formData: FormData,
): Promise<SupportActionResult<ArticleAttachment>> {
    const articleId = String(formData.get('article_id') ?? '')
    if (!articleId) return { success: false, error: 'Brak ID artykułu.' }
    const file = formData.get('file')
    if (!(file instanceof File)) return { success: false, error: 'Plik jest wymagany.' }
    const title = String(formData.get('title') ?? '')
    return uploadArticleAttachment(articleId, file, title)
}

export async function uploadArticleAttachment(
    articleId: string,
    file: File,
    title: string,
): Promise<SupportActionResult<ArticleAttachment>> {
    try {
        const { supabase, user } = await requireSuperAdmin()
        if (!title || title.trim().length < 2) return { success: false, error: 'Tytuł musi mieć co najmniej 2 znaki.' }
        const fileErr = validateFile(file)
        if (fileErr) return { success: false, error: fileErr }

        const safeName = sanitizeFileName(file.name)
        const filePath = `attachments/${articleId}/${Date.now()}_${safeName}`

        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(filePath, file, {
            contentType: file.type,
            upsert: false,
        })
        if (uploadErr) throw new Error(`Upload nie powiódł się: ${uploadErr.message}`)

        const { data, error } = await supabase
            .from('support_article_attachments')
            .insert({
                article_id: articleId,
                title: title.trim(),
                file_path: filePath,
                file_name: file.name,
                file_size: file.size,
                mime_type: file.type,
                uploaded_by: user.id,
            })
            .select('*')
            .single()
        if (error || !data) {
            await supabase.storage.from(BUCKET).remove([filePath]).catch((e) =>
                logCompat.error('[uploadArticleAttachment] cleanup failed:', e),
            )
            throw new Error(`Zapis metadanych nie powiódł się: ${error?.message ?? 'unknown'}`)
        }

        revalidatePath('/support/kb')
        revalidatePath(`/admin/support/kb`)
        return { success: true, data: data as ArticleAttachment }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd uploadu załącznika'
        logCompat.error('[uploadArticleAttachment]', error)
        return { success: false, error: msg }
    }
}

export async function deleteArticleAttachment(id: string): Promise<SupportActionResult<true>> {
    try {
        const { supabase } = await requireSuperAdmin()
        const { data: existing, error: fetchErr } = await supabase
            .from('support_article_attachments')
            .select('file_path')
            .eq('id', id)
            .single()
        if (fetchErr || !existing) return { success: false, error: 'Załącznik nie istnieje.' }

        const { error: deleteRowErr } = await supabase.from('support_article_attachments').delete().eq('id', id)
        if (deleteRowErr) throw deleteRowErr

        await supabase.storage.from(BUCKET).remove([existing.file_path]).catch((e) =>
            logCompat.error('[deleteArticleAttachment] storage cleanup failed:', e),
        )

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb')
        return { success: true, data: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd usuwania załącznika'
        return { success: false, error: msg }
    }
}

// ─── Signed URL for download (any authenticated user) ────────────────────────

export async function getMaterialDownloadUrl(filePath: string): Promise<SupportActionResult<string>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 5)
        if (error || !data) return { success: false, error: error?.message ?? 'Nie udało się wygenerować linku.' }
        return { success: true, data: data.signedUrl }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd generowania linku'
        return { success: false, error: msg }
    }
}
