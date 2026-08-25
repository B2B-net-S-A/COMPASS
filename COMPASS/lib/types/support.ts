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
    is_active?: boolean
}

// Phase 21 — managed by super-admin via /admin/support/kb/categories
export interface CategoryInput {
    slug: string
    name_pl: string
    name_en?: string
    icon?: string
    sort_order?: number
    is_active?: boolean
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

// ============================================================
// Inbox Kanban — Phase 10 (2026-05-06)
// Manually entered tickets with P1/P2/P3 SLA, distinct from user-submitted ones.
// 1:1 join on support_tickets via support_inbox_meta.
//
// Phase 44 (2026-07-29) — the Graph mailbox auto-import was removed: every reply
// in a thread landed as its own ticket, so the board became unusable. Tickets are
// entered by hand again. `'email'` survives in the union only because ~178 rows
// ingested on 27–28.07 still carry it (bulk-closed, kept for the record).
// ============================================================

export type InboxPriorityLevel = 'P1' | 'P2' | 'P3'
export type InboxSource = 'manual_paste' | 'email' | 'user'

export interface SupportInboxMeta {
    ticket_id: string
    source: InboxSource
    external_message_id: string | null
    /** Legacy profiles(role='consultant') link — kept for back-compat, no longer written. */
    consultant_id: string | null
    /** Phase 40 — consultant the ticket concerns (matched contractor or manual free-text). */
    consultant_name: string | null
    /** Phase 40 — consultant phone (auto-filled from contractor or entered manually). */
    consultant_phone: string | null
    /** Phase 40 — client (auto-filled from contractor.current_client or entered manually). */
    client_name: string | null
    /** Phase 40 — contractors directory link when matched; NULL for manual entries. */
    contractor_id: string | null
    priority_level: InboxPriorityLevel
    due_date: string
    email_from: string | null
    email_subject: string | null
    email_received_at: string | null
    created_at: string
}

export interface InboxTicketWithMeta extends SupportTicketWithMeta {
    meta: SupportInboxMeta
    consultant_name: string | null
    /** Phase 40 — consultant phone snapshot, surfaced on the card + detail view. */
    consultant_phone: string | null
    /** Phase 40 — client name, surfaced on the card + detail view. */
    client_name: string | null
}

export interface CreateInboxTicketInput {
    category_id: string
    subject: string
    body_md: string
    priority_level: InboxPriorityLevel
    /** Phase 40 — consultant fields (directory-backed or manual). */
    consultant_name?: string
    consultant_phone?: string
    client_name?: string
    /** Set when the consultant was matched against the contractors directory. */
    contractor_id?: string
    /** @deprecated legacy profiles link — no longer used by the form. */
    consultant_id?: string
    assignee_id?: string
    email_from?: string
    email_received_at?: string
    external_message_id?: string
    source?: InboxSource
}

/**
 * Phase 40 — a consultant/candidate suggestion from the contractors directory,
 * used by the "Podpięty konsultant" typeahead. Manual entries carry `id = null`.
 */
export interface ConsultantSearchResult {
    id: string
    full_name: string
    phone: string | null
    current_client: string | null
    current_position: string | null
}

export const SLA_DAYS: Record<InboxPriorityLevel, number> = { P1: 2, P2: 5, P3: 10 }

export const INBOX_PRIORITY_LABEL: Record<InboxPriorityLevel, string> = {
    P1: 'P1 (2 dni)',
    P2: 'P2 (5 dni)',
    P3: 'P3 (10 dni)',
}

// Rodzina „skrzynka administracja@" jest w kodzie zdefiniowana DWA razy i te dwie
// definicje nie są ze sobą spięte:
//   1. ta lista — używana przez `.in('slug', …)` w kanbanie, na stronie /admin/inbox
//      i w kaflu Spraw w People Ops,
//   2. prefiks `slug LIKE 'inbox_%'` — używany w layoucie strefy chronionej oraz
//      (razem z `contractor_%`) do WYKLUCZANIA skrzynki z helpdesku.
// Skutek rozjazdu jest cichy i jednokierunkowo groźny: kategoria dodana w bazie,
// ale nie dopisana tutaj, zniknie z kanbana (lista jej nie obejmie), a jednocześnie
// wypadnie z helpdesku (prefiks ją złapie) — zgłoszenie nie pokaże się nigdzie.
// Historia potwierdza, że to realne: `inbox_offboarding` i `inbox_onboarding`
// dochodziły do bazy osobnymi migracjami (05/2026) i lista była poprawiana ręcznie.
// Odwrotny kierunek jest nieszkodliwy i występuje dziś: `inbox_wypowiedzenie` jest
// tu wymienione, ale na prodzie takiej kategorii NIE MA (`support_categories` zna
// 5 slugów `inbox_%`) — `.in()` po prostu jej nie dopasuje.
// Ujednolicenie (wszędzie prefiks) dotyka plików spoza `lib/types` — patrz raport audytu.
export const INBOX_CATEGORY_SLUGS = [
    'inbox_negocjacje',
    'inbox_wypowiedzenie',
    'inbox_administracja',
    'inbox_offboarding',
    'inbox_onboarding',
    'inbox_inne',
] as const

export type InboxCategorySlug = (typeof INBOX_CATEGORY_SLUGS)[number]

// Phase 49 — tytuł zgłoszenia jest edytowalny po utworzeniu. Limity wspólne dla
// tworzenia i zmiany nazwy, egzekwowane po obu stronach (input maxLength + akcja).
export const TICKET_SUBJECT_MIN = 3
export const TICKET_SUBJECT_MAX = 200

// ============================================================
// KB Materials & Attachments — Phase 21 (2026-05-16)
// ============================================================

export interface CategoryMaterial {
    id: string
    category_id: string
    title: string
    description: string | null
    file_path: string
    file_name: string
    file_size: number
    mime_type: string
    sort_order: number
    uploaded_by: string
    created_at: string
    updated_at: string
}

export interface ArticleAttachment {
    id: string
    article_id: string
    title: string
    file_path: string
    file_name: string
    file_size: number
    mime_type: string
    sort_order: number
    uploaded_by: string
    created_at: string
    updated_at: string
}

export const MAX_MATERIAL_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export const ALLOWED_MATERIAL_MIME = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'text/plain',
    'text/csv',
] as const

export type AllowedMaterialMime = (typeof ALLOWED_MATERIAL_MIME)[number]

