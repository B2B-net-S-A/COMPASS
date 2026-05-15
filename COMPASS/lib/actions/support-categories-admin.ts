'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/require-super-admin'
import { logCompat } from '@/lib/logger'
import type { CategoryInput, SupportActionResult, SupportCategory } from '@/lib/types/support'

function sanitizeSlug(raw: string): string {
    return raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60)
}

function validateInput(input: CategoryInput): string | null {
    if (!input.slug || sanitizeSlug(input.slug).length < 2) return 'Slug musi mieć co najmniej 2 znaki (a-z, 0-9, _, -).'
    if (!input.name_pl || input.name_pl.trim().length < 2) return 'Nazwa PL musi mieć co najmniej 2 znaki.'
    return null
}

export async function createCategory(input: CategoryInput): Promise<SupportActionResult<SupportCategory>> {
    try {
        const { supabase } = await requireSuperAdmin()
        const err = validateInput(input)
        if (err) return { success: false, error: err }

        const slug = sanitizeSlug(input.slug)
        const payload = {
            slug,
            name_pl: input.name_pl.trim(),
            name_en: (input.name_en ?? input.name_pl).trim(),
            icon: input.icon?.trim() || 'HelpCircle',
            sort_order: input.sort_order ?? 0,
            is_active: input.is_active ?? true,
        }

        const { data, error } = await supabase
            .from('support_categories')
            .insert(payload)
            .select('*')
            .single()
        if (error) {
            if (error.code === '23505') return { success: false, error: `Kategoria o slugu "${slug}" już istnieje.` }
            throw error
        }

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb')
        revalidatePath('/admin/support/kb/categories')
        return { success: true, data: data as SupportCategory }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd tworzenia kategorii'
        logCompat.error('[createCategory]', error)
        return { success: false, error: msg }
    }
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<SupportActionResult<SupportCategory>> {
    try {
        const { supabase } = await requireSuperAdmin()

        const updates: Record<string, unknown> = {}
        if (patch.name_pl !== undefined) {
            if (patch.name_pl.trim().length < 2) return { success: false, error: 'Nazwa PL musi mieć co najmniej 2 znaki.' }
            updates.name_pl = patch.name_pl.trim()
        }
        if (patch.name_en !== undefined) updates.name_en = patch.name_en.trim() || updates.name_pl
        if (patch.icon !== undefined) updates.icon = patch.icon.trim() || 'HelpCircle'
        if (patch.sort_order !== undefined) updates.sort_order = patch.sort_order
        if (patch.is_active !== undefined) updates.is_active = patch.is_active
        // Slug zostaje stabilny (FK + cache) — nie pozwalamy edytować slugu.

        if (Object.keys(updates).length === 0) return { success: false, error: 'Brak zmian.' }

        const { data, error } = await supabase
            .from('support_categories')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single()
        if (error) throw error

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb')
        revalidatePath('/admin/support/kb/categories')
        return { success: true, data: data as SupportCategory }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd aktualizacji kategorii'
        logCompat.error('[updateCategory]', error)
        return { success: false, error: msg }
    }
}

export async function deleteCategory(id: string): Promise<SupportActionResult<{ softDeleted: boolean }>> {
    try {
        const { supabase } = await requireSuperAdmin()

        // Sprawdź czy kategoria ma artykuły lub materiały — jeśli tak, soft-delete (is_active=false).
        const [articlesRes, materialsRes] = await Promise.all([
            supabase.from('support_articles').select('id', { count: 'exact', head: true }).eq('category_id', id),
            supabase.from('support_category_materials').select('id', { count: 'exact', head: true }).eq('category_id', id),
        ])
        const articlesCount = articlesRes.count ?? 0
        const materialsCount = materialsRes.count ?? 0

        if (articlesCount > 0 || materialsCount > 0) {
            const { error } = await supabase
                .from('support_categories')
                .update({ is_active: false })
                .eq('id', id)
            if (error) throw error
            revalidatePath('/support/kb')
            revalidatePath('/admin/support/kb/categories')
            return { success: true, data: { softDeleted: true } }
        }

        const { error } = await supabase.from('support_categories').delete().eq('id', id)
        if (error) throw error
        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb/categories')
        return { success: true, data: { softDeleted: false } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd usuwania kategorii'
        logCompat.error('[deleteCategory]', error)
        return { success: false, error: msg }
    }
}

export async function reorderCategories(orderedIds: string[]): Promise<SupportActionResult<true>> {
    try {
        const { supabase } = await requireSuperAdmin()
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { success: false, error: 'Pusta lista' }

        // Wsadowa aktualizacja sort_order. Używamy zwykłego loop UPDATE — Supabase JS
        // nie ma batch UPDATE, ale to mała tabela (~10 kategorii).
        for (let i = 0; i < orderedIds.length; i++) {
            const { error } = await supabase
                .from('support_categories')
                .update({ sort_order: (i + 1) * 10 })
                .eq('id', orderedIds[i])
            if (error) throw error
        }

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb/categories')
        return { success: true, data: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zmiany kolejności'
        logCompat.error('[reorderCategories]', error)
        return { success: false, error: msg }
    }
}

export async function listCategoriesForAdmin(): Promise<SupportActionResult<SupportCategory[]>> {
    try {
        const { supabase } = await requireSuperAdmin()
        const { data, error } = await supabase
            .from('support_categories')
            .select('*')
            .order('sort_order', { ascending: true })
        if (error) throw error
        return { success: true, data: (data ?? []) as SupportCategory[] }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania kategorii'
        return { success: false, error: msg }
    }
}
