import type { InboxTicketWithMeta } from '@/lib/types/support'
export const ticket = (changes: Partial<InboxTicketWithMeta> = {}): InboxTicketWithMeta => ({
    id: '11111111-1111-4111-8111-111111111111', user_id: 'user', assignee_id: 'user', category_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    subject: 'Przygotować grafikę', body_md: 'Materiały dla kampanii klienta', status: 'open', priority: 'normal',
    created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-13T10:00:00Z', resolved_at: null,
    category_slug: 'inbox_grafika', category_name_pl: 'Grafika', user_name: 'Anna', assignee_name: 'Łukasz', comment_count: 0,
    consultant_name: 'Żaneta', consultant_phone: null, client_name: 'Nordea',
    meta: { ticket_id: '11111111-1111-4111-8111-111111111111', source: 'manual_paste', priority_level: 'P3', due_date: '2026-09-10T10:00:00Z',
        consultant_id: null, consultant_name: null, consultant_phone: null, client_name: null, contractor_id: null, external_message_id: null, email_from: null, email_subject: null, email_received_at: null, created_at: '2026-09-01T10:00:00Z',
        work_area: 'administration', planned_due_date: null, waiting_for: null, follow_up_date: null, checklist: [], materials: [],
    }, ...changes,
})
