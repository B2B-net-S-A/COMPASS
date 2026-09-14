import type { InboxTicketWithMeta, TicketStatus } from '@/lib/types/support'

export const INBOX_WORK_PRIORITY_LABEL = { P1: 'P1 · Pilny', P2: 'P2 · Wysoki', P3: 'P3 · Zwykły' } as const

export type InboxArea = 'administration' | 'marketing'
export const AREA_LABELS = { administration: 'Administracja', marketing: 'Marketing' } as const
export const INBOX_STATUS_LABELS: Record<TicketStatus, string> = {
    open: 'Do zrobienia', in_progress: 'W trakcie', waiting_user: 'Oczekuje', resolved: 'Rozwiązane', closed: 'Zamknięte',
}
export const STATUS_HELP: Record<TicketStatus, string> = {
    open: 'Nowe sprawy do podjęcia.', in_progress: 'Sprawy, nad którymi trwa praca.',
    waiting_user: 'Czekamy na odpowiedź lub wykonanie kolejnego kroku.',
    resolved: 'Praca wykonana; sprawa może jeszcze wymagać potwierdzenia. W aktywnym widoku: ostatnie 14 dni.',
    closed: 'Obsługa zakończona. Historia pozostaje w archiwum.',
}
export type InboxSort = 'deadline' | 'priority' | 'inactive' | 'updated'
export interface InboxFilters {
    area: 'all' | InboxArea
    view: 'active' | 'archive'
    query: string
    assignee: string
    category: string
    priority: string
    client: string
    quick: 'all' | 'mine' | 'unassigned' | 'overdue' | 'follow_up'
    sort: InboxSort
}
export const DEFAULT_FILTERS: InboxFilters = {
    area: 'all', view: 'active', query: '', assignee: '', category: '', priority: '', client: '', quick: 'all', sort: 'deadline',
}
export const isFinished = (status: TicketStatus) => status === 'resolved' || status === 'closed'
export const getInboxArea = (ticket: InboxTicketWithMeta): InboxArea => ticket.meta.work_area
    ?? (ticket.category_slug === 'inbox_marketing' ? 'marketing' : 'administration')
export function warsawDay(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
    return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)!.value).join('-')
}
export function deadlineDay(ticket: InboxTicketWithMeta): string | null {
    return ticket.meta.planned_due_date || (getInboxArea(ticket) === 'marketing' ? null : warsawDay(new Date(ticket.meta.due_date)))
}
export function isOverdue(ticket: InboxTicketWithMeta, now = new Date()): boolean {
    if (isFinished(ticket.status)) return false
    if (ticket.meta.planned_due_date) return ticket.meta.planned_due_date < warsawDay(now)
    return getInboxArea(ticket) !== 'marketing' && new Date(ticket.meta.due_date).getTime() < now.getTime()
}
export function needsFollowUp(ticket: InboxTicketWithMeta, now = new Date()): boolean {
    return !isFinished(ticket.status) && !!ticket.meta.follow_up_date && ticket.meta.follow_up_date <= warsawDay(now)
}
export function matchesView(ticket: InboxTicketWithMeta, view: InboxFilters['view'], now: Date): boolean {
    if (view === 'archive') return isFinished(ticket.status)
    if (ticket.status === 'closed') return false
    if (ticket.status === 'resolved') return new Date(ticket.resolved_at ?? ticket.updated_at).getTime() >= now.getTime() - 14 * 86400000
    return true
}
const normalized = (value: string) => value.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
export function filterInboxTickets(tickets: InboxTicketWithMeta[], filters: InboxFilters, userId: string, now = new Date()): InboxTicketWithMeta[] {
    const query = normalized(filters.query.trim())
    return tickets.filter((ticket) => {
        if (filters.area !== 'all' && getInboxArea(ticket) !== filters.area) return false
        if (!matchesView(ticket, filters.view, now)) return false
        if (filters.assignee && ticket.assignee_id !== filters.assignee) return false
        if (filters.category && ticket.category_id !== filters.category) return false
        if (filters.priority && ticket.meta.priority_level !== filters.priority) return false
        if (filters.client && ticket.client_name !== filters.client) return false
        if (filters.quick === 'mine' && ticket.assignee_id !== userId) return false
        if (filters.quick === 'unassigned' && ticket.assignee_id) return false
        if (filters.quick === 'overdue' && !isOverdue(ticket, now)) return false
        if (filters.quick === 'follow_up' && !needsFollowUp(ticket, now)) return false
        return !query || normalized([ticket.subject, ticket.body_md, ticket.consultant_name, ticket.client_name, ticket.assignee_name].filter(Boolean).join(' ')).includes(query)
    }).sort((a, b) => {
        let order = 0
        if (filters.sort === 'deadline') order = (deadlineDay(a) ?? '9999').localeCompare(deadlineDay(b) ?? '9999')
        if (filters.sort === 'priority' || (filters.sort === 'deadline' && order === 0)) order = a.meta.priority_level.localeCompare(b.meta.priority_level)
        if (filters.sort === 'inactive') order = a.updated_at.localeCompare(b.updated_at)
        if (filters.sort === 'updated') order = b.updated_at.localeCompare(a.updated_at)
        return order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    })
}
export function groupInboxTickets(tickets: InboxTicketWithMeta[]): Record<TicketStatus, InboxTicketWithMeta[]> {
    const columns: Record<TicketStatus, InboxTicketWithMeta[]> = { open: [], in_progress: [], waiting_user: [], resolved: [], closed: [] }
    tickets.forEach((ticket) => columns[ticket.status].push(ticket))
    return columns
}
