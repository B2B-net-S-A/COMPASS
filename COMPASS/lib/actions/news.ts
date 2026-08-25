'use server'

import { logCompat } from '@/lib/logger'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
    CreateNewsPostInput,
    NewsActionResult,
    NewsPost,
    NewsPostDetail,
    NewsPostListItem,
    ReactionKind,
    UpdateNewsPostPatch,
} from '@/lib/types/news'
import { excludeExited } from '@/lib/hr/employment-window'

async function isCallerAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    return data?.role === 'admin'
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
        .slice(0, 80) || 'post'
}

async function enrichPosts(
    supabase: ReturnType<typeof createClient>,
    posts: NewsPost[],
    currentUserId: string,
): Promise<NewsPostListItem[]> {
    if (posts.length === 0) return []

    const postIds = posts.map((p) => p.id)
    const authorIds = Array.from(new Set(posts.map((p) => p.author_id)))

    const [{ data: profiles }, { data: reactions }, { data: reads }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', authorIds),
        supabase.from('news_reactions').select('post_id, user_id, kind').in('post_id', postIds),
        supabase.from('news_post_reads').select('post_id').in('post_id', postIds).eq('user_id', currentUserId),
    ])

    const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
    const readSet = new Set(((reads ?? []) as Array<{ post_id: string }>).map((r) => r.post_id))

    const reactionCounts = new Map<string, Record<ReactionKind, number>>()
    const userReactions = new Map<string, ReactionKind>()
    for (const r of (reactions ?? []) as Array<{ post_id: string; user_id: string; kind: ReactionKind }>) {
        if (!reactionCounts.has(r.post_id)) {
            reactionCounts.set(r.post_id, { like: 0, heart: 0, celebrate: 0 })
        }
        reactionCounts.get(r.post_id)![r.kind] += 1
        if (r.user_id === currentUserId) {
            userReactions.set(r.post_id, r.kind)
        }
    }

    return posts.map((p) => ({
        ...p,
        author_name: profileMap.get(p.author_id) ?? null,
        is_read: readSet.has(p.id),
        reaction_counts: reactionCounts.get(p.id) ?? { like: 0, heart: 0, celebrate: 0 },
        user_reaction: userReactions.get(p.id) ?? null,
    }))
}

export async function listNewsForUser(): Promise<NewsActionResult<NewsPostListItem[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('news_posts')
            .select('*')
            .not('published_at', 'is', null)
            .order('pinned', { ascending: false })
            .order('published_at', { ascending: false })
            .limit(50)

        if (error) throw error
        const enriched = await enrichPosts(supabase, (data ?? []) as NewsPost[], user.id)
        return { success: true, data: enriched }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania newsów'
        logCompat.error('[listNewsForUser]', error)
        return { success: false, error: msg }
    }
}

export async function listAllNewsAdmin(): Promise<NewsActionResult<NewsPostListItem[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        const { data, error } = await supabase
            .from('news_posts')
            .select('*')
            .order('pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100)

        if (error) throw error
        const enriched = await enrichPosts(supabase, (data ?? []) as NewsPost[], user.id)
        return { success: true, data: enriched }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania newsów'
        return { success: false, error: msg }
    }
}

export async function getNewsPostBySlug(slug: string): Promise<NewsActionResult<NewsPostDetail>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('news_posts')
            .select('*')
            .eq('slug', slug)
            .single()

        if (error || !data) return { success: false, error: 'Post nie istnieje lub brak dostępu' }

        const enriched = (await enrichPosts(supabase, [data as NewsPost], user.id))[0]
        const isAdmin = await isCallerAdmin(supabase, user.id)

        return { success: true, data: { ...enriched, can_edit: isAdmin } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania posta'
        return { success: false, error: msg }
    }
}

export async function createNewsPost(input: CreateNewsPostInput): Promise<NewsActionResult<{ id: string; slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        if (!input.title || input.title.trim().length < 3) return { success: false, error: 'Tytuł min 3 znaki' }
        if (!input.body_md || input.body_md.trim().length < 10) return { success: false, error: 'Treść min 10 znaków' }

        const slug = `${slugify(input.title)}-${Math.random().toString(36).slice(2, 6)}`
        const audience = input.audience_role && input.audience_role.length > 0 ? input.audience_role : null

        const { data, error } = await supabase
            .from('news_posts')
            .insert({
                slug,
                title: input.title.trim(),
                excerpt: input.excerpt?.trim() || null,
                body_md: input.body_md.trim(),
                cover_url: input.cover_url ?? null,
                author_id: user.id,
                pinned: input.pinned ?? false,
                audience_role: audience,
                published_at: input.publish ? new Date().toISOString() : null,
            })
            .select('id, slug')
            .single()

        if (error) throw error

        // Notify all matching consultants on publish (no-op if draft)
        if (input.publish) {
            const targetRoles = audience ?? ['consultant', 'admin']
            // Powiadomienia o newsie nie idą do byłych pracowników.
            const { data: targets } = await excludeExited(
                supabase.from('profiles').select('id').in('role', targetRoles as unknown as ('consultant' | 'admin' | 'internal' | 'finanse' | 'manager' | 'talent_community')[]),
            )
            const ids = ((targets ?? []) as Array<{ id: string }>).map((p) => p.id)
            if (ids.length > 0) {
                const rows = ids.map((uid) => ({
                    user_id: uid,
                    type: 'news_published',
                    title_pl: input.title.trim(),
                    title_en: input.title.trim(),
                    body_pl: input.excerpt?.trim() || 'Zobacz nowy post',
                    body_en: input.excerpt?.trim() || 'See new post',
                    priority: 'normal',
                }))
                await supabase.from('notifications').insert(rows)
            }
        }

        revalidatePath('/news')
        revalidatePath('/admin/news')
        return { success: true, data: { id: data.id, slug: data.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd publikacji posta'
        logCompat.error('[createNewsPost]', error)
        return { success: false, error: msg }
    }
}

export async function updateNewsPost(postId: string, patch: UpdateNewsPostPatch): Promise<NewsActionResult<{ slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        const { data: existing } = await supabase
            .from('news_posts')
            .select('id, slug, published_at')
            .eq('id', postId)
            .single()
        if (!existing) return { success: false, error: 'Post nie istnieje' }

        const updates: Record<string, unknown> = {}
        if (patch.title !== undefined) updates.title = patch.title.trim()
        if (patch.excerpt !== undefined) updates.excerpt = patch.excerpt?.trim() || null
        if (patch.body_md !== undefined) updates.body_md = patch.body_md.trim()
        if (patch.cover_url !== undefined) updates.cover_url = patch.cover_url
        if (patch.pinned !== undefined) updates.pinned = patch.pinned
        if (patch.audience_role !== undefined) {
            updates.audience_role = patch.audience_role && patch.audience_role.length > 0 ? patch.audience_role : null
        }
        if (patch.publish !== undefined) {
            updates.published_at = patch.publish ? (existing.published_at ?? new Date().toISOString()) : null
        }

        const { error } = await supabase.from('news_posts').update(updates).eq('id', postId)
        if (error) throw error

        revalidatePath('/news')
        revalidatePath('/admin/news')
        revalidatePath(`/news/${existing.slug}`)
        return { success: true, data: { slug: existing.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd aktualizacji posta'
        return { success: false, error: msg }
    }
}

export async function deleteNewsPost(postId: string): Promise<NewsActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        const { error } = await supabase.from('news_posts').delete().eq('id', postId)
        if (error) throw error

        revalidatePath('/news')
        revalidatePath('/admin/news')
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd kasowania'
        return { success: false, error: msg }
    }
}

export async function toggleReaction(postId: string, kind: ReactionKind): Promise<NewsActionResult<{ active: boolean }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: existing } = await supabase
            .from('news_reactions')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .eq('kind', kind)
            .maybeSingle()

        if (existing) {
            const { error } = await supabase.from('news_reactions').delete().eq('id', existing.id)
            if (error) throw error
            revalidatePath('/news')
            return { success: true, data: { active: false } }
        }

        // Remove any other reaction by this user (one reaction per post per user)
        await supabase.from('news_reactions').delete().eq('post_id', postId).eq('user_id', user.id)

        const { error } = await supabase.from('news_reactions').insert({
            post_id: postId,
            user_id: user.id,
            kind,
        })
        if (error) throw error

        revalidatePath('/news')
        return { success: true, data: { active: true } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd reakcji'
        return { success: false, error: msg }
    }
}

export async function markPostRead(postId: string): Promise<NewsActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // Idempotent insert (PK + ON CONFLICT)
        await supabase
            .from('news_post_reads')
            .insert({ post_id: postId, user_id: user.id })
            .select()
            .maybeSingle()

        return { success: true, data: undefined }
    } catch {
        // Swallow PK conflict — already read
        return { success: true, data: undefined }
    }
}

export async function getUnreadNewsCount(): Promise<NewsActionResult<number>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: true, data: 0 }

        const { count: total } = await supabase
            .from('news_posts')
            .select('id', { count: 'exact', head: true })
            .not('published_at', 'is', null)

        const { count: read } = await supabase
            .from('news_post_reads')
            .select('post_id', { count: 'exact', head: true })
            .eq('user_id', user.id)

        const unread = Math.max(0, (total ?? 0) - (read ?? 0))
        return { success: true, data: unread }
    } catch {
        return { success: true, data: 0 }
    }
}
