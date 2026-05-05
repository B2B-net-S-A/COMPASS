// ============================================================
// Support Center — types shared between server actions and components.
// Phase 3 (2026-05-04).
// ============================================================

export type TicketStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface SupportCategory {
    id: string
    slug: string
    name_pl: string
    name_en: string
    icon: string
    sort_order: number
}

export interface SupportTicket {
    id: string
    user_id: string
    assignee_id: string | null
    category_id: string
    subject: string
    body_md: string
    status: TicketStatus
    priority: TicketPriority
    resolved_at: string | null
    created_at: string
    updated_at: string
}

export interface SupportTicketWithMeta extends SupportTicket {
    category_slug: string
    category_name_pl: string
    user_name: string | null
    assignee_name: string | null
    comment_count: number
}

export interface SupportComment {
    id: string
    ticket_id: string
    author_id: string
    author_name: string | null
    body_md: string
    is_internal: boolean
    created_at: string
}

export interface SupportTicketDetail extends SupportTicketWithMeta {
    comments: SupportComment[]
    can_reply: boolean
    can_change_status: boolean
}

export interface CreateTicketInput {
    category_id: string
    subject: string
    body_md: string
    priority?: TicketPriority
    assignee_id?: string
    /** Chat-mode threads relax min-length validation (auto-generated subject + short first message). */
    is_chat?: boolean
}

export interface SupportArticle {
    id: string
    slug: string
    title: string
    excerpt: string | null
    content_md: string
    category_id: string
    author_id: string
    published_at: string | null
    created_at: string
    updated_at: string
}

export interface SupportArticleListItem {
    id: string
    slug: string
    title: string
    excerpt: string | null
    category_slug: string
    category_name_pl: string
    published_at: string | null
}

export interface CreateArticleInput {
    category_id: string
    slug: string
    title: string
    excerpt?: string
    content_md: string
    publish?: boolean
}

export type SupportActionResult<T> = { success: true; data: T } | { success: false; error: string }

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
    open: 'Otwarte',
    in_progress: 'W trakcie',
    waiting_user: 'Oczekuje na Ciebie',
    resolved: 'Rozwiązane',
    closed: 'Zamknięte',
}

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
    low: 'Niski',
    normal: 'Normalny',
    high: 'Wysoki',
    urgent: 'Pilny',
}
