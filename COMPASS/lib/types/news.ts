// Phase 4 (2026-05-04): Aktualności types

export type ReactionKind = 'like' | 'heart' | 'celebrate'

export interface NewsPost {
    id: string
    slug: string
    title: string
    excerpt: string | null
    body_md: string
    cover_url: string | null
    author_id: string
    published_at: string | null
    pinned: boolean
    audience_role: string[] | null
    created_at: string
    updated_at: string
}

export interface NewsPostListItem extends NewsPost {
    author_name: string | null
    is_read: boolean
    reaction_counts: Record<ReactionKind, number>
    user_reaction: ReactionKind | null
}

export interface NewsPostDetail extends NewsPostListItem {
    can_edit: boolean
}

export interface CreateNewsPostInput {
    title: string
    excerpt?: string
    body_md: string
    cover_url?: string
    pinned?: boolean
    audience_role?: string[]
    publish?: boolean
}

export interface UpdateNewsPostPatch {
    title?: string
    excerpt?: string | null
    body_md?: string
    cover_url?: string | null
    pinned?: boolean
    audience_role?: string[] | null
    publish?: boolean
}

// Audyt 2026-08 (B1): ten sam kształt był zdefiniowany niezależnie w trzech
// plikach typów. Kanoniczna definicja mieszka teraz w lib/actions/action-result.ts
// razem z `runAction` i `ExpectedError`; ten alias zostaje, żeby nie przepisywać
// całych modułów naraz. Nowy kod importuje bezpośrednio stamtąd.
export type NewsActionResult<T> = import('@/lib/actions/action-result').ActionResult<T>

export const REACTION_LABEL: Record<ReactionKind, string> = {
    like: '👍',
    heart: '❤️',
    celebrate: '🎉',
}
