'use server'

import { logCompat } from '@/lib/logger'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
    CreateArticleInput,
    SupportActionResult,
    SupportArticle,
    SupportArticleListItem,
} from '@/lib/types/support'

async function isAdminOrTrainer(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    return ['admin'].includes(data?.role ?? '')
}

function slugify(text: string): string {
    const polishMap: Record<string, string> = {
        ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
        Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
    }
    return text
        .split('').map((c) => polishMap[c] ?? c).join('')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80)
}

export async function listArticlesByCategory(categorySlug?: string, options: { onlyPublished?: boolean } = { onlyPublished: true }): Promise<SupportActionResult<SupportArticleListItem[]>> {
    try {
        const supabase = createClient()
        const { data: categories } = await supabase
            .from('support_categories')
            .select('id, slug, name_pl')

        const categoryMap = new Map((categories ?? []).map((c: { id: string; slug: string; name_pl: string }) => [c.id, c]))

        let query = supabase
            .from('support_articles')
            .select('id, slug, title, excerpt, category_id, published_at')
            .order('published_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(100)

        if (options.onlyPublished !== false) {
            query = query.not('published_at', 'is', null)
        }

        if (categorySlug) {
            const matchingCat = (categories ?? []).find((c: { slug: string }) => c.slug === categorySlug)
            if (!matchingCat) return { success: true, data: [] }
            query = query.eq('category_id', matchingCat.id)
        }

        const { data, error } = await query
        if (error) throw error

        const items: SupportArticleListItem[] = (data ?? []).map((a: { id: string; slug: string; title: string; excerpt: string | null; category_id: string; published_at: string | null }) => {
            const cat = categoryMap.get(a.category_id)
            return {
                id: a.id,
                slug: a.slug,
                title: a.title,
                excerpt: a.excerpt,
                category_slug: cat?.slug ?? '',
                category_name_pl: cat?.name_pl ?? '',
                published_at: a.published_at,
            }
        })

        return { success: true, data: items }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania artykułów'
        logCompat.error('[listArticlesByCategory]', error)
        return { success: false, error: msg }
    }
}

export async function getArticleBySlug(slug: string): Promise<SupportActionResult<SupportArticle>> {
    try {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('support_articles')
            .select('*')
            .eq('slug', slug)
            .single()

        if (error || !data) return { success: false, error: 'Artykuł nie istnieje lub brak dostępu' }
        return { success: true, data: data as SupportArticle }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania artykułu'
        return { success: false, error: msg }
    }
}

export async function createArticle(input: CreateArticleInput): Promise<SupportActionResult<{ articleId: string; slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const allowed = await isAdminOrTrainer(supabase, user.id)
        if (!allowed) return { success: false, error: 'Niewystarczające uprawnienia' }

        if (!input.title || input.title.trim().length < 3) return { success: false, error: 'Tytuł jest wymagany (min 3)' }
        if (!input.content_md || input.content_md.trim().length < 10) return { success: false, error: 'Treść jest wymagana (min 10)' }

        const slug = input.slug?.trim() || `${slugify(input.title)}-${Math.random().toString(36).slice(2, 6)}`

        const { data, error } = await supabase
            .from('support_articles')
            .insert({
                slug,
                title: input.title.trim(),
                excerpt: input.excerpt?.trim() || null,
                content_md: input.content_md.trim(),
                category_id: input.category_id,
                author_id: user.id,
                published_at: input.publish ? new Date().toISOString() : null,
            })
            .select('id, slug')
            .single()

        if (error) throw error

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb')
        return { success: true, data: { articleId: data.id, slug: data.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd tworzenia artykułu'
        logCompat.error('[createArticle]', error)
        return { success: false, error: msg }
    }
}

export async function updateArticle(articleId: string, patch: Partial<CreateArticleInput> & { publish?: boolean }): Promise<SupportActionResult<{ slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const allowed = await isAdminOrTrainer(supabase, user.id)
        if (!allowed) return { success: false, error: 'Niewystarczające uprawnienia' }

        const { data: existing } = await supabase
            .from('support_articles')
            .select('id, slug, published_at')
            .eq('id', articleId)
            .single()
        if (!existing) return { success: false, error: 'Artykuł nie istnieje' }

        const updates: Record<string, unknown> = {}
        if (patch.title !== undefined) updates.title = patch.title.trim()
        if (patch.excerpt !== undefined) updates.excerpt = patch.excerpt?.trim() || null
        if (patch.content_md !== undefined) updates.content_md = patch.content_md.trim()
        if (patch.category_id !== undefined) updates.category_id = patch.category_id
        if (patch.publish !== undefined) {
            updates.published_at = patch.publish ? (existing.published_at ?? new Date().toISOString()) : null
        }

        const { error } = await supabase.from('support_articles').update(updates).eq('id', articleId)
        if (error) throw error

        revalidatePath('/support/kb')
        revalidatePath('/admin/support/kb')
        revalidatePath(`/support/kb/${existing.slug}`)
        return { success: true, data: { slug: existing.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu artykułu'
        return { success: false, error: msg }
    }
}
