import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const authState = vi.hoisted(() => ({
    allowed: true,
    isAdmin: false,
    userId: 'tcm-1',
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireLifecycleManagerAction: async () => {
        if (!authState.allowed) {
            // Realny guard rzuca dla konsultanta/anon — moduł mapy jest niedostępny.
            throw new Error('Brak uprawnień: wymagany administrator lub Talent Community.')
        }
        return {
            userId: authState.userId,
            email: 'tcm@b2bnetwork.pl',
            role: authState.isAdmin ? 'admin' : 'talent_community',
            isAdmin: authState.isAdmin,
            isManager: false,
            isTalentCommunity: !authState.isAdmin,
            hasTcmAccess: false,
            canLogOvertime: false,
        }
    },
}))

vi.mock('@/lib/actions/audit', () => ({
    logAudit: vi.fn(async () => {}),
}))

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}))

vi.mock('@/lib/actions/contractors', () => ({
    listConversations: vi.fn(async () => []),
}))

// Supabase service-client stub: thenable chain per tabela + rejestr zapisów.
const db = vi.hoisted(() => ({
    tables: {} as Record<string, Array<Record<string, unknown>>>,
    inserts: [] as Array<{ table: string; rows: unknown }>,
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
    upserts: [] as Array<{ table: string; rows: Record<string, unknown> }>,
    insertError: null as { code?: string; message: string } | null,
}))

function makeChain(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {}
    const self = () => chain
    for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'order', 'limit', 'ilike', 'or', 'delete']) {
        chain[m] = vi.fn(self)
    }
    chain.insert = vi.fn((rows: unknown) => {
        db.inserts.push({ table, rows })
        return chain
    })
    chain.update = vi.fn((patch: Record<string, unknown>) => {
        db.updates.push({ table, patch })
        return chain
    })
    chain.upsert = vi.fn((rows: Record<string, unknown>) => {
        db.upserts.push({ table, rows })
        return chain
    })
    chain.single = vi.fn(async () => {
        if (db.insertError) return { data: null, error: db.insertError }
        return { data: (db.tables[table] ?? [])[0] ?? null, error: null }
    })
    chain.maybeSingle = vi.fn(async () => ({
        data: (db.tables[table] ?? [])[0] ?? null,
        error: null,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.then = (resolve: any) => resolve({ data: db.tables[table] ?? [], error: null })
    return chain
}

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({ from: (table: string) => makeChain(table) }),
}))

import type { CardInput } from '@/lib/types/tech-map'
import {
    createCardDraft,
    createClientForTechMap,
    createTechnologyUnverified,
    finalizeCard,
    getClientTechMap,
    getPreInterviewBrief,
    getRotationOverview,
    listCards,
    listClientsWithCards,
    listTechnologies,
    overrideBlockAssignment,
    recalcBlockAssignments,
    saveCard,
    updateTechnology,
} from '@/lib/actions/tech-map'

const card = (over: Partial<CardInput> = {}): CardInput => ({
    contractorId: 'c-1',
    clientId: 'k-1',
    clientAreaId: null,
    interviewDate: '2026-08-01',
    block: 'B',
    status: 'ok',
    satisfaction: 4,
    satisfactionComment: null,
    projectEndMonth: 12,
    projectEndYear: 2026,
    projectEndUnknown: false,
    hiring: false,
    hiringRoles: [],
    hiringSource: null,
    memorableQuote: null,
    techOldNew: null,
    teamSize: null,
    teamExternals: null,
    vendorsNote: null,
    technologyIds: [],
    vendorIds: [],
    initiatives: [],
    ...over,
})

beforeEach(() => {
    authState.allowed = true
    authState.isAdmin = false
    authState.userId = 'tcm-1'
    db.tables = {}
    db.inserts = []
    db.updates = []
    db.upserts = []
    db.insertError = null
})

describe('kontrola dostępu — moduł niedostępny bez guardu lifecycle', () => {
    it.each([
        ['listTechnologies', () => listTechnologies()],
        ['listCards', () => listCards()],
        ['createCardDraft', () => createCardDraft(card())],
        ['getPreInterviewBrief', () => getPreInterviewBrief('c-1')],
        ['createClientForTechMap', () => createClientForTechMap('Acme')],
        ['createTechnologyUnverified', () => createTechnologyUnverified('Rust')],
        // Etap 2
        ['getClientTechMap', () => getClientTechMap('k-1')],
        ['listClientsWithCards', () => listClientsWithCards()],
        ['getRotationOverview', () => getRotationOverview()],
        ['recalcBlockAssignments', () => recalcBlockAssignments()],
        ['overrideBlockAssignment', () => overrideBlockAssignment({ contractorId: 'c-1', block: 'C' })],
    ])('%s odrzuca użytkownika bez uprawnień', async (_name, run) => {
        authState.allowed = false
        await expect(run()).rejects.toThrow('Brak uprawnień')
    })
})

describe('createCardDraft', () => {
    it('odrzuca kartę bez klienta (walidacja bazowa)', async () => {
        await expect(createCardDraft(card({ clientId: '' }))).rejects.toThrow('Wybierz klienta')
    })

    it('zapisuje draft z tcm_id z kontekstu i materializuje przydział bloku', async () => {
        db.tables.tech_interview_cards = [{ id: 'card-1' }]
        const result = await createCardDraft(card({ technologyIds: ['t-1', 't-2'] }))
        expect(result).toEqual({ id: 'card-1' })

        const cardInsert = db.inserts.find((i) => i.table === 'tech_interview_cards')
        expect(cardInsert).toBeTruthy()
        const row = cardInsert!.rows as Record<string, unknown>
        expect(row.tcm_id).toBe('tcm-1')
        expect(row.is_draft).toBe(true)
        expect(row.block).toBe('B')

        const junction = db.inserts.find((i) => i.table === 'tech_interview_card_technologies')
        expect(junction).toBeTruthy()
        expect(junction!.rows).toHaveLength(2)

        // Brak historii przydziałów → fallback wstawia start cyklu (B) jako auto.
        const assignment = db.upserts.find((u) => u.table === 'tech_block_assignments')
        expect(assignment).toBeTruthy()
        expect(assignment!.rows.block).toBe('B')
        expect(assignment!.rows.source).toBe('auto')
    })

    it('nie nadpisuje istniejącego przydziału kwartału (manual jest lepki)', async () => {
        db.tables.tech_interview_cards = [{ id: 'card-1' }]
        db.tables.tech_block_assignments = [
            { period_year: 2026, period_quarter: 3, block: 'C', source: 'manual' },
        ]
        await createCardDraft(card({ interviewDate: '2026-08-01' }))
        expect(db.upserts.find((u) => u.table === 'tech_block_assignments')).toBeUndefined()
    })
})

describe('saveCard / finalizeCard — własność i kompletność', () => {
    const foreignCard = {
        id: 'card-1',
        contractor_id: 'c-1',
        tcm_id: 'ktos-inny',
        created_by: 'ktos-inny',
        is_draft: true,
        block: 'B',
    }

    it('nie pozwala edytować cudzej karty (nie-admin)', async () => {
        db.tables.tech_interview_cards = [foreignCard]
        await expect(saveCard('card-1', card())).rejects.toThrow('własne karty')
    })

    it('admin może edytować cudzą kartę', async () => {
        authState.isAdmin = true
        db.tables.tech_interview_cards = [foreignCard]
        await expect(saveCard('card-1', card())).resolves.toBeUndefined()
    })

    it('nie pozwala zmienić konsultanta na istniejącej karcie', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        await expect(saveCard('card-1', card({ contractorId: 'INNY' }))).rejects.toThrow(
            'Nie można zmienić konsultanta',
        )
    })

    it('finalizacja niekompletnej karty (brak statusu) jest odrzucana', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        await expect(finalizeCard('card-1', card({ status: null }))).rejects.toThrow('Status rozmowy')
    })

    it('finalizacja kompletnej karty przechodzi i zdejmuje draft', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        await finalizeCard('card-1', card())
        const patch = db.updates.find((u) => u.table === 'tech_interview_cards')?.patch
        expect(patch?.is_draft).toBe(false)
        expect(patch?.finalized_at).toBeTruthy()
    })
})

describe('słownik technologii', () => {
    it('duplikat (23505) zwraca istniejącą pozycję zamiast błędu — tag-picker wybiera kanoniczną', async () => {
        db.insertError = { code: '23505', message: 'duplicate' }
        db.tables.technologies = [{ id: 't-1', name: 'Kubernetes', slug: 'kubernetes' }]
        const row = await createTechnologyUnverified('kubernetes')
        expect(row.id).toBe('t-1')
    })

    it('edycja słownika wymaga admina', async () => {
        await expect(updateTechnology({ id: 't-1', name: 'Nowa' })).rejects.toThrow(
            'Tylko administrator',
        )
    })
})

describe('createClientForTechMap', () => {
    it('normalizuje nazwę (trim + zbite spacje) przed zapisem', async () => {
        db.tables.clients = [{ id: 'k-9', name: 'Acme Corp' }]
        await createClientForTechMap('  Acme   Corp ')
        const insert = db.inserts.find((i) => i.table === 'clients')
        expect((insert!.rows as Record<string, unknown>).name).toBe('Acme Corp')
    })
})

describe('Etap 2 — karta klienta', () => {
    it('agreguje tylko karty sfinalizowane (filtr is_draft=false idzie do zapytania)', async () => {
        db.tables.clients = [{ id: 'k-1', name: 'PKO BP' }]
        db.tables.tech_interview_cards = [
            {
                id: 'c1',
                client_area_id: null,
                interview_date: '2026-07-01',
                block: 'B',
                hiring: true,
                hiring_roles: ['Java Developer'],
                hiring_source: 'widzial',
                project_end_month: 12,
                project_end_year: 2026,
                project_end_unknown: false,
                tech_old_new: null,
                vendors_note: null,
                memorable_quote: null,
                team_size: null,
                team_externals: null,
            },
        ]
        const result = await getClientTechMap('k-1')
        expect(result.client.name).toBe('PKO BP')
        expect(result.map.totalCards).toBe(1)
        expect(result.map.demandSignals).toHaveLength(1)
        expect(result.map.projectEnds[0].period).toBe('2026-12')
    })

    it('rzuca dla nieistniejącego klienta', async () => {
        db.tables.clients = []
        await expect(getClientTechMap('brak')).rejects.toThrow('Klient nie istnieje')
    })

    it('wymaga id klienta', async () => {
        await expect(getClientTechMap('')).rejects.toThrow('Brak id klienta')
    })

    it('listClientsWithCards grupuje karty per klient i bierze najświeższą datę', async () => {
        db.tables.tech_interview_cards = [
            { client_id: 'k-1', interview_date: '2026-05-01' },
            { client_id: 'k-1', interview_date: '2026-07-01' },
            { client_id: 'k-2', interview_date: '2026-06-01' },
        ]
        db.tables.clients = [{ id: 'k-1', name: 'PKO BP' }]
        const rows = await listClientsWithCards()
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({ id: 'k-1', cards: 2, lastInterviewDate: '2026-07-01' })
    })
})

describe('Etap 2 — rotacja bloków', () => {
    it('przegląd wylicza blok bez zapisu (render bez side-effectów)', async () => {
        db.tables.contractors = [{ id: 'c-1', full_name: 'Adam Bogun', current_client: 'PKO BP' }]
        db.tables.tech_block_assignments = []
        const overview = await getRotationOverview()
        expect(overview.rows[0]).toMatchObject({ block: 'B', basis: 'computed', source: null })
        expect(overview.unassigned).toBe(1)
        expect(db.inserts).toHaveLength(0)
        expect(db.upserts).toHaveLength(0)
    })

    it('przelicz przydziały wymaga admina', async () => {
        await expect(recalcBlockAssignments()).rejects.toThrow('Tylko administrator')
    })

    it('override wymaga admina', async () => {
        await expect(
            overrideBlockAssignment({ contractorId: 'c-1', block: 'C' }),
        ).rejects.toThrow('Tylko administrator')
    })

    it('override odrzuca nieprawidłowy blok', async () => {
        authState.isAdmin = true
        await expect(
            overrideBlockAssignment({ contractorId: 'c-1', block: 'Z' as never }),
        ).rejects.toThrow('Nieprawidłowy blok')
    })

    it('override istniejącego przydziału ustawia source=manual', async () => {
        authState.isAdmin = true
        db.tables.tech_block_assignments = [{ id: 'a-1', block: 'B' }]
        await overrideBlockAssignment({ contractorId: 'c-1', block: 'D' })
        const patch = db.updates.find((u) => u.table === 'tech_block_assignments')?.patch
        expect(patch).toMatchObject({ block: 'D', source: 'manual' })
    })

    it('override bez istniejącego przydziału wstawia nowy wiersz manual', async () => {
        authState.isAdmin = true
        db.tables.tech_block_assignments = []
        await overrideBlockAssignment({ contractorId: 'c-1', block: 'C' })
        const insert = db.inserts.find((i) => i.table === 'tech_block_assignments')
        expect(insert!.rows).toMatchObject({ block: 'C', source: 'manual', contractor_id: 'c-1' })
    })
})
