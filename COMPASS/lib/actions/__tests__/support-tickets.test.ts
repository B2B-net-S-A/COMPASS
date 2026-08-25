import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}))

vi.mock('@/lib/teams/webhook', () => ({
    postToTeamsAlert: vi.fn(async () => undefined),
}))

import {
    addComment,
    assignTicket,
    changeTicketStatus,
    createTicket,
    getTicketDetail,
    listSupportCategories,
} from '../support-tickets'

afterEach(() => {
    vi.clearAllMocks()
})

// Trzy rodziny kategorii mieszkają w jednej tabeli `support_tickets` i różni je
// WYŁĄCZNIE prefiks sluga: helpdesk (bez prefiksu), skrzynka administracja@
// (`inbox_%`) i lustro spraw kontraktorskich (`contractor_%`, usunięte krokiem C2 —
// zostaje w fixture, bo bariera ma trzymać także po jego powrocie).
const CAT_HELPDESK = 'cat-hr'
const CAT_INBOX = 'cat-inbox'
const CAT_CONTRACTOR = 'cat-ctr'

function setup(user: { id: string }, overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {}): MockSupabase {
    const cfg: MockSupabaseConfig = {
        user: user as MockSupabaseConfig['user'],
        tables: {
            profiles: overrides.profiles ?? [
                { id: 'admin1', role: 'admin', full_name: 'Admin' },
                { id: 'cons1', role: 'consultant', full_name: 'Jan' },
            ],
            support_categories: overrides.support_categories ?? [
                { id: CAT_HELPDESK, slug: 'hr', name_pl: 'HR', is_active: true, sort_order: 1 },
                { id: CAT_INBOX, slug: 'inbox_administracja', name_pl: 'Administracja', is_active: true, sort_order: 2 },
                { id: CAT_CONTRACTOR, slug: 'contractor_conversation', name_pl: 'Rozmowa', is_active: true, sort_order: 3 },
            ],
            support_tickets: overrides.support_tickets ?? [
                {
                    id: 'tk-help', user_id: 'cons1', assignee_id: null, category_id: CAT_HELPDESK,
                    subject: 'Nie działa VPN', body_md: 'treść', status: 'open', priority: 'normal',
                    resolved_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
                },
                {
                    id: 'tk-inbox', user_id: 'admin1', assignee_id: null, category_id: CAT_INBOX,
                    subject: 'Sprawa ze skrzynki', body_md: 'treść', status: 'open', priority: 'normal',
                    resolved_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
                },
                {
                    id: 'tk-ctr', user_id: 'admin1', assignee_id: null, category_id: CAT_CONTRACTOR,
                    subject: 'Rozmowa z kontraktorem', body_md: 'treść', status: 'open', priority: 'normal',
                    resolved_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
                },
            ],
            support_ticket_comments: overrides.support_ticket_comments ?? [],
            notifications: overrides.notifications ?? [],
        },
    }
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

describe('helpdesk nie sięga do zgłoszeń skrzynki ani spraw kontraktorskich', () => {
    it('listSupportCategories zwraca wyłącznie kategorie helpdesku', async () => {
        setup({ id: 'cons1' })
        const res = await listSupportCategories()
        expect(res.success).toBe(true)
        const slugs = res.success ? res.data.map((c) => c.slug) : []
        expect(slugs).toEqual(['hr'])
    })

    it('createTicket odrzuca kategorię skrzynki', async () => {
        const client = setup({ id: 'cons1' })
        const res = await createTicket({
            category_id: CAT_INBOX,
            subject: 'Podszywam się pod skrzynkę',
            body_md: 'wystarczająco długa treść zgłoszenia',
        })
        expect(res.success).toBe(false)
        // Nic nie wpadło na kanban TCM.
        expect(client._tables.support_tickets).toHaveLength(3)
    })

    it('createTicket przepuszcza kategorię helpdesku', async () => {
        const client = setup({ id: 'cons1' })
        const res = await createTicket({
            category_id: CAT_HELPDESK,
            subject: 'Nowe zgłoszenie',
            body_md: 'wystarczająco długa treść zgłoszenia',
        })
        expect(res.success).toBe(true)
        expect(client._tables.support_tickets).toHaveLength(4)
    })

    it.each([
        ['skrzynki', 'tk-inbox'],
        ['spraw kontraktorskich', 'tk-ctr'],
    ])('getTicketDetail nie wydaje zgłoszenia %s', async (_label, ticketId) => {
        setup({ id: 'admin1' })
        const res = await getTicketDetail(ticketId)
        expect(res.success).toBe(false)
        // Ten sam komunikat co przy braku dostępu — bez potwierdzania, że id istnieje.
        expect(res.success === false && res.error).toBe('Ticket nie istnieje lub brak dostępu')
    })

    it('getTicketDetail wydaje zgłoszenie helpdesku', async () => {
        setup({ id: 'admin1' })
        const res = await getTicketDetail('tk-help')
        expect(res.success).toBe(true)
    })

    it('changeTicketStatus nie rusza zgłoszenia ze skrzynki', async () => {
        const client = setup({ id: 'admin1' })
        const res = await changeTicketStatus('tk-inbox', 'resolved')
        expect(res.success).toBe(false)
        const inbox = client._tables.support_tickets.find((t) => t.id === 'tk-inbox')
        expect(inbox?.status).toBe('open')
    })

    it('assignTicket nie rusza zgłoszenia ze skrzynki', async () => {
        const client = setup({ id: 'admin1' })
        const res = await assignTicket('tk-inbox', 'admin1')
        expect(res.success).toBe(false)
        const inbox = client._tables.support_tickets.find((t) => t.id === 'tk-inbox')
        expect(inbox?.assignee_id).toBeNull()
    })

    it('addComment nie dopisuje komentarza do zgłoszenia ze skrzynki', async () => {
        const client = setup({ id: 'admin1' })
        const res = await addComment('tk-inbox', 'komentarz helpdeskowy')
        expect(res.success).toBe(false)
        expect(client._tables.support_ticket_comments).toHaveLength(0)
    })

    it('addComment działa na zgłoszeniu helpdesku', async () => {
        const client = setup({ id: 'cons1' })
        const res = await addComment('tk-help', 'komentarz helpdeskowy')
        expect(res.success).toBe(true)
        expect(client._tables.support_ticket_comments).toHaveLength(1)
    })
})
