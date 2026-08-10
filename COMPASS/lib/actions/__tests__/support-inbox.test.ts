import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

// Phase 40 — searchConsultants + phone write-back use the service client; back it
// with the same mock instance so it shares the `contractors` fixture table.
vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => currentClient,
}))

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}))

// Phase 49 — renameInboxTicket pisze do audytu; audyt sięga po next/headers,
// więc w testach zastępujemy go stubem (wzorzec z tech-map.test.ts).
vi.mock('@/lib/actions/audit', () => ({
    logAudit: vi.fn(),
}))

function setupClient(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

const baseTables = (overrides: Partial<{
    profiles: Array<Record<string, unknown>>
    support_categories: Array<Record<string, unknown>>
    support_tickets: Array<Record<string, unknown>>
    support_inbox_meta: Array<Record<string, unknown>>
    support_ticket_comments: Array<Record<string, unknown>>
    notifications: Array<Record<string, unknown>>
    contractors: Array<Record<string, unknown>>
}> = {}) => ({
    profiles: overrides.profiles ?? [
        { id: 'handler1', email: 'blazej@b2bnetwork.pl', full_name: 'Błażej', role: 'consultant', is_inbox_handler: true },
        { id: 'admin1', email: 'admin@b2bnetwork.pl', full_name: 'Admin', role: 'admin', is_inbox_handler: false },
        { id: 'cons1', email: 'jan@example.com', full_name: 'Jan Kowalski', role: 'consultant', is_inbox_handler: false },
        { id: 'cons2', email: 'anna@example.com', full_name: 'Anna Nowak', role: 'consultant', is_inbox_handler: false },
        { id: 'ext1', email: 'someone@example.com', full_name: 'Someone Else', role: 'consultant', is_inbox_handler: false },
    ],
    // Phase 40 — the consultant typeahead searches the contractors directory.
    contractors: overrides.contractors ?? [
        { id: 'k1', full_name: 'Jan Kowalski', phone: null, current_client: 'Nordea', current_position: 'Senior Dev' },
        { id: 'k2', full_name: 'Anna Nowak', phone: '+48 600 100 200', current_client: 'VeloBank', current_position: null },
        { id: 'k3', full_name: 'Piotr Zieliński', phone: null, current_client: 'Xperi', current_position: 'QA' },
    ],
    support_categories: overrides.support_categories ?? [
        { id: 'cat-neg', slug: 'inbox_negocjacje', name_pl: 'Negocjacje umowy', name_en: 'Contract negotiation', sort_order: 100 },
        { id: 'cat-wyp', slug: 'inbox_wypowiedzenie', name_pl: 'Wypowiedzenie', name_en: 'Termination', sort_order: 101 },
        { id: 'cat-adm', slug: 'inbox_administracja', name_pl: 'Administracja', name_en: 'Administration', sort_order: 102 },
        { id: 'cat-inn', slug: 'inbox_inne', name_pl: 'Inne (inbox)', name_en: 'Other (inbox)', sort_order: 103 },
        { id: 'cat-hr', slug: 'hr', name_pl: 'HR', name_en: 'HR', sort_order: 1 },
    ],
    support_tickets: overrides.support_tickets ?? [],
    support_inbox_meta: overrides.support_inbox_meta ?? [],
    support_ticket_comments: overrides.support_ticket_comments ?? [],
    notifications: overrides.notifications ?? [],
})

describe('createInboxTicket', () => {
    it('rejects unauthenticated user', async () => {
        setupClient({ user: null, tables: baseTables() })
        const { createInboxTicket } = await import('../support-inbox')
        const res = await createInboxTicket({
            category_id: 'cat-adm',
            subject: 'Test',
            body_md: 'long enough body',
            priority_level: 'P1',
        })
        expect(res.success).toBe(false)
    })

    it('rejects non-handler caller', async () => {
        setupClient({
            user: { id: 'ext1', email: 'someone@example.com' },
            tables: baseTables(),
        })
        const { createInboxTicket } = await import('../support-inbox')
        const res = await createInboxTicket({
            category_id: 'cat-adm',
            subject: 'Test ticket',
            body_md: 'long enough body',
            priority_level: 'P1',
        })
        expect(res.success).toBe(false)
        if (res.success) return
        expect(res.error).toMatch(/uprawnienia/)
    })

    it('rejects category that is not inbox_*', async () => {
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables(),
        })
        const { createInboxTicket } = await import('../support-inbox')
        const res = await createInboxTicket({
            category_id: 'cat-hr',
            subject: 'Test ticket',
            body_md: 'long enough body',
            priority_level: 'P1',
        })
        expect(res.success).toBe(false)
        if (res.success) return
        expect(res.error).toMatch(/kategoria/i)
    })

    it('creates ticket + meta with correct due_date for P1 (2 working days)', async () => {
        const client = setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables(),
        })
        const { createInboxTicket } = await import('../support-inbox')
        const res = await createInboxTicket({
            category_id: 'cat-adm',
            subject: 'Negotiation update',
            body_md: 'Client wants to renegotiate contract terms',
            priority_level: 'P1',
            email_received_at: '2026-05-06T10:00:00Z', // Wed → +2 = Fri 2026-05-08
        })
        expect(res.success).toBe(true)
        if (!res.success) return
        const ticketId = res.data.ticketId
        const metaRows = client._tables.support_inbox_meta as Array<Record<string, unknown>>
        const meta = metaRows.find(m => m.ticket_id === ticketId)
        expect(meta).toBeDefined()
        expect(meta?.priority_level).toBe('P1')
        expect((meta?.due_date as string).slice(0, 10)).toBe('2026-05-08')
        expect(meta?.source).toBe('manual_paste')
    })

    it('persists consultant fields and writes a learned phone back to the contractor', async () => {
        const client = setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables(),
        })
        const { createInboxTicket } = await import('../support-inbox')
        const res = await createInboxTicket({
            category_id: 'cat-adm',
            subject: 'Sprawa konsultanta',
            body_md: 'Opis sprawy wystarczająco długi',
            priority_level: 'P3',
            consultant_name: 'Jan Kowalski',
            consultant_phone: '+48 601 202 303',
            client_name: 'Nordea',
            contractor_id: 'k1',
        })
        expect(res.success).toBe(true)
        if (!res.success) return
        const metaRows = client._tables.support_inbox_meta as Array<Record<string, unknown>>
        const meta = metaRows.find(m => m.ticket_id === res.data.ticketId)
        expect(meta?.consultant_name).toBe('Jan Kowalski')
        expect(meta?.consultant_phone).toBe('+48 601 202 303')
        expect(meta?.client_name).toBe('Nordea')
        expect(meta?.contractor_id).toBe('k1')
        // k1 had no phone → learned from the ticket
        const contractors = client._tables.contractors as Array<Record<string, unknown>>
        expect(contractors.find(c => c.id === 'k1')?.phone).toBe('+48 601 202 303')
    })

    it('allows a manual consultant with no contractor link (no write-back)', async () => {
        const client = setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables(),
        })
        const { createInboxTicket } = await import('../support-inbox')
        const res = await createInboxTicket({
            category_id: 'cat-adm',
            subject: 'Sprawa ręczna',
            body_md: 'Opis sprawy wystarczająco długi',
            priority_level: 'P3',
            consultant_name: 'Ktoś Spoza Bazy',
            consultant_phone: '+48 700 800 900',
        })
        expect(res.success).toBe(true)
        if (!res.success) return
        const metaRows = client._tables.support_inbox_meta as Array<Record<string, unknown>>
        const meta = metaRows.find(m => m.ticket_id === res.data.ticketId)
        expect(meta?.consultant_name).toBe('Ktoś Spoza Bazy')
        expect(meta?.contractor_id).toBeNull()
        // no contractor was linked → directory untouched
        const contractors = client._tables.contractors as Array<Record<string, unknown>>
        expect(contractors.every(c => c.phone !== '+48 700 800 900')).toBe(true)
    })

    it('rejects too-short subject', async () => {
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables(),
        })
        const { createInboxTicket } = await import('../support-inbox')
        const res = await createInboxTicket({
            category_id: 'cat-adm',
            subject: 'ab',
            body_md: 'long enough body to pass',
            priority_level: 'P2',
        })
        expect(res.success).toBe(false)
        if (res.success) return
        expect(res.error).toMatch(/tytu/i)
    })
})

describe('moveInboxTicket', () => {
    it('rejects when ticket has no inbox meta (cross-contamination guard)', async () => {
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables({
                support_tickets: [
                    { id: 't-user', user_id: 'someone', category_id: 'cat-hr', status: 'open', subject: 'User ticket', body_md: '...', priority: 'normal', assignee_id: null, resolved_at: null, created_at: '2026-05-01', updated_at: '2026-05-01' },
                ],
            }),
        })
        const { moveInboxTicket } = await import('../support-inbox')
        const res = await moveInboxTicket('t-user', 'in_progress')
        expect(res.success).toBe(false)
        if (res.success) return
        expect(res.error).toMatch(/inbox/)
    })

    it('moves inbox ticket to new status and sets resolved_at on resolved', async () => {
        const client = setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables({
                support_tickets: [
                    { id: 't-inbox', user_id: 'handler1', category_id: 'cat-adm', status: 'open', subject: 'Test', body_md: 'long body', priority: 'normal', assignee_id: 'handler1', resolved_at: null, created_at: '2026-05-01', updated_at: '2026-05-01' },
                ],
                support_inbox_meta: [
                    { ticket_id: 't-inbox', source: 'manual_paste', priority_level: 'P2', due_date: '2026-05-13T10:00:00Z', consultant_id: null, external_message_id: null, email_from: null, email_subject: 'Test', email_received_at: null, created_at: '2026-05-01' },
                ],
            }),
        })
        const { moveInboxTicket } = await import('../support-inbox')
        const res = await moveInboxTicket('t-inbox', 'resolved')
        expect(res.success).toBe(true)
        const ticketRows = client._tables.support_tickets as Array<Record<string, unknown>>
        const updated = ticketRows.find(t => t.id === 't-inbox')
        expect(updated?.status).toBe('resolved')
        expect(updated?.resolved_at).toBeTruthy()
    })
})

describe('renameInboxTicket', () => {
    const withInboxTicket = (subject = 'Onboarding - Wojciech Sokolnicki') =>
        baseTables({
            support_tickets: [
                { id: 't-inbox', user_id: 'handler1', category_id: 'cat-adm', status: 'open', subject, body_md: 'long body', priority: 'normal', assignee_id: 'handler1', resolved_at: null, created_at: '2026-05-01', updated_at: '2026-05-01' },
            ],
            support_inbox_meta: [
                { ticket_id: 't-inbox', source: 'manual_paste', priority_level: 'P2', due_date: '2026-05-13T10:00:00Z', consultant_id: null, external_message_id: null, email_from: null, email_subject: subject, email_received_at: null, created_at: '2026-05-01' },
            ],
        })

    it('rejects non-handler caller', async () => {
        setupClient({ user: { id: 'ext1', email: 'someone@example.com' }, tables: withInboxTicket() })
        const { renameInboxTicket } = await import('../support-inbox')
        const res = await renameInboxTicket('t-inbox', 'Nowy tytuł')
        expect(res.success).toBe(false)
    })

    it('rejects ticket without inbox meta (cross-contamination guard)', async () => {
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables({
                support_tickets: [
                    { id: 't-user', user_id: 'someone', category_id: 'cat-hr', status: 'open', subject: 'User ticket', body_md: '...', priority: 'normal', assignee_id: null, resolved_at: null, created_at: '2026-05-01', updated_at: '2026-05-01' },
                ],
            }),
        })
        const { renameInboxTicket } = await import('../support-inbox')
        const res = await renameInboxTicket('t-user', 'Nowy tytuł')
        expect(res.success).toBe(false)
        if (res.success) return
        expect(res.error).toMatch(/inbox/)
    })

    it('rejects too short title', async () => {
        setupClient({ user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' }, tables: withInboxTicket() })
        const { renameInboxTicket } = await import('../support-inbox')
        const res = await renameInboxTicket('t-inbox', '  a  ')
        expect(res.success).toBe(false)
        if (res.success) return
        expect(res.error).toMatch(/tytu/i)
    })

    it('rejects title over the length limit', async () => {
        setupClient({ user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' }, tables: withInboxTicket() })
        const { renameInboxTicket } = await import('../support-inbox')
        const { TICKET_SUBJECT_MAX } = await import('@/lib/types/support')
        const res = await renameInboxTicket('t-inbox', 'x'.repeat(TICKET_SUBJECT_MAX + 1))
        expect(res.success).toBe(false)
    })

    it('saves a trimmed title and leaves the original email_subject untouched', async () => {
        const client = setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: withInboxTicket(),
        })
        const { renameInboxTicket } = await import('../support-inbox')
        const res = await renameInboxTicket('t-inbox', '  Onboarding   PFRON  ')
        expect(res.success).toBe(true)
        if (!res.success) return
        expect(res.data.subject).toBe('Onboarding PFRON')

        const ticket = (client._tables.support_tickets as Array<Record<string, unknown>>)
            .find(t => t.id === 't-inbox')
        expect(ticket?.subject).toBe('Onboarding PFRON')
        const meta = (client._tables.support_inbox_meta as Array<Record<string, unknown>>)
            .find(m => m.ticket_id === 't-inbox')
        expect(meta?.email_subject).toBe('Onboarding - Wojciech Sokolnicki')
    })
})

describe('searchConsultants', () => {
    it('returns empty array for queries shorter than 2 chars', async () => {
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables(),
        })
        const { searchConsultants } = await import('../support-inbox')
        const res = await searchConsultants('a')
        expect(res.success).toBe(true)
        if (res.success) expect(res.data).toEqual([])
    })

    it('rejects non-handler caller', async () => {
        setupClient({
            user: { id: 'ext1', email: 'someone@example.com' },
            tables: baseTables(),
        })
        const { searchConsultants } = await import('../support-inbox')
        const res = await searchConsultants('jan')
        expect(res.success).toBe(false)
    })

    it('finds contractors by partial name and returns phone + client', async () => {
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables: baseTables(),
        })
        const { searchConsultants } = await import('../support-inbox')
        const res = await searchConsultants('nowak')
        expect(res.success).toBe(true)
        if (!res.success) return
        const anna = res.data.find(c => c.id === 'k2')
        expect(anna).toBeDefined()
        expect(anna?.current_client).toBe('VeloBank')
        expect(anna?.phone).toBe('+48 600 100 200')
        // Piotr does not match 'nowak'
        expect(res.data.some(c => c.id === 'k3')).toBe(false)
    })
})

describe('listInboxTickets', () => {
    it('rejects non-handler', async () => {
        setupClient({
            user: { id: 'ext1', email: 'someone@example.com' },
            tables: baseTables(),
        })
        const { listInboxTickets } = await import('../support-inbox')
        const res = await listInboxTickets()
        expect(res.success).toBe(false)
    })

    it('groups inbox tickets by status', async () => {
        const tables = baseTables({
            support_tickets: [
                { id: 't1', user_id: 'handler1', category_id: 'cat-adm', status: 'open', subject: 'A', body_md: 'b', priority: 'normal', assignee_id: 'handler1', resolved_at: null, created_at: '2026-05-01', updated_at: '2026-05-01' },
                { id: 't2', user_id: 'handler1', category_id: 'cat-neg', status: 'in_progress', subject: 'B', body_md: 'b', priority: 'normal', assignee_id: 'handler1', resolved_at: null, created_at: '2026-05-02', updated_at: '2026-05-02' },
            ],
            support_inbox_meta: [
                { ticket_id: 't1', source: 'manual_paste', priority_level: 'P1', due_date: '2026-05-08', consultant_id: 'cons1', external_message_id: null, email_from: null, email_subject: 'A', email_received_at: null, created_at: '2026-05-01' },
                { ticket_id: 't2', source: 'manual_paste', priority_level: 'P3', due_date: '2026-05-15', consultant_id: null, external_message_id: null, email_from: null, email_subject: 'B', email_received_at: null, created_at: '2026-05-02' },
            ],
        })
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables,
        })
        const { listInboxTickets } = await import('../support-inbox')
        const res = await listInboxTickets()
        expect(res.success).toBe(true)
        if (!res.success) return
        expect(res.data.open).toHaveLength(1)
        expect(res.data.in_progress).toHaveLength(1)
        expect(res.data.open[0].id).toBe('t1')
        expect(res.data.open[0].consultant_name).toBe('Jan Kowalski')
    })

    it('filters by priority_level', async () => {
        const tables = baseTables({
            support_tickets: [
                { id: 't1', user_id: 'handler1', category_id: 'cat-adm', status: 'open', subject: 'A', body_md: 'b', priority: 'normal', assignee_id: 'handler1', resolved_at: null, created_at: '2026-05-01', updated_at: '2026-05-01' },
                { id: 't2', user_id: 'handler1', category_id: 'cat-neg', status: 'open', subject: 'B', body_md: 'b', priority: 'normal', assignee_id: 'handler1', resolved_at: null, created_at: '2026-05-02', updated_at: '2026-05-02' },
            ],
            support_inbox_meta: [
                { ticket_id: 't1', source: 'manual_paste', priority_level: 'P1', due_date: '2026-05-08', consultant_id: null, external_message_id: null, email_from: null, email_subject: 'A', email_received_at: null, created_at: '2026-05-01' },
                { ticket_id: 't2', source: 'manual_paste', priority_level: 'P3', due_date: '2026-05-15', consultant_id: null, external_message_id: null, email_from: null, email_subject: 'B', email_received_at: null, created_at: '2026-05-02' },
            ],
        })
        setupClient({
            user: { id: 'handler1', email: 'blazej@b2bnetwork.pl' },
            tables,
        })
        const { listInboxTickets } = await import('../support-inbox')
        const res = await listInboxTickets({ priority_level: 'P1' })
        expect(res.success).toBe(true)
        if (!res.success) return
        expect(res.data.open.map(t => t.id)).toEqual(['t1'])
    })
})
