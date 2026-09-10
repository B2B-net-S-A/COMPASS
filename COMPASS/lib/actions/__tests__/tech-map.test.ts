import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const authState = vi.hoisted(() => ({
    allowed: true,
    isAdmin: false,
    userId: 'tcm-1',
}))

const fakeCtx = () => ({
    userId: authState.userId,
    email: 'tcm@b2bnetwork.pl',
    role: authState.isAdmin ? 'admin' : 'talent_community',
    isAdmin: authState.isAdmin,
    isManager: false,
    isTalentCommunity: !authState.isAdmin,
    hasTcmAccess: false,
    canLogOvertime: false,
    canViewTechMap: false,
})

// Guardy rzucają ExpectedError (kontrakt B1) — dzięki temu runAction zwraca ich
// treść użytkownikowi zamiast generycznego komunikatu o awarii.
vi.mock('@/lib/auth/internal-guard', async () => {
    const { ExpectedError } = await import('@/lib/actions/expected-error')
    return {
        requireLifecycleManagerAction: async () => {
            if (!authState.allowed) {
                // Realny guard rzuca dla konsultanta/anon — moduł mapy jest niedostępny.
                throw new ExpectedError('Brak uprawnień: wymagany administrator lub Talent Community.')
            }
            return fakeCtx()
        },
        requireTechMapViewerAction: async () => {
            if (!authState.allowed) throw new ExpectedError('Brak uprawnień do mapy technologicznej.')
            return fakeCtx()
        },
    }
})

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

import type { ActionResult } from '@/lib/actions/action-result'
import type { CardInput } from '@/lib/types/tech-map'
import {
    createCardDraft,
    createClientForTechMap,
    createTechnologyUnverified,
    finalizeCard,
    getAlertRecipientsConfig,
    getClientTechMap,
    getPreInterviewBrief,
    getTechMapKpi,
    listCards,
    listClientsWithCards,
    listTechnologies,
    saveCard,
    setAlertRecipients,
    updateTechnology,
} from '@/lib/actions/tech-map'

const card = (over: Partial<CardInput> = {}): CardInput => ({
    contractorId: 'c-1',
    clientId: 'k-1',
    clientAreaId: null,
    title: null,
    interviewDate: '2026-08-01',
    status: 'ok',
    satisfaction: 4,
    satisfactionComment: null,
    projectEndMonth: 12,
    projectEndYear: 2026,
    projectEndUnknown: false,
    hiring: false,
    hiringRoles: [],
    hiringSource: null,
    professionalInsurance: null,
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

// Akcje zapisu zwracają ActionResult — odmowa uprawnień to `{success:false}`
// z treścią guardu, a nie wyjątek. Akcje czysto odczytowe zostały przy rzucaniu
// (wołają je komponenty serwerowe, które łapią wyjątek i robią notFound()).
const readActionsRejecting: Array<[string, () => Promise<unknown>]> = [
    ['listTechnologies', () => listTechnologies()],
    ['listCards', () => listCards()],
    ['getPreInterviewBrief', () => getPreInterviewBrief('c-1')],
    // Etap 2
    ['getClientTechMap', () => getClientTechMap('k-1')],
    ['listClientsWithCards', () => listClientsWithCards()],
    // Etap 3
    ['getTechMapKpi', () => getTechMapKpi()],
    ['getAlertRecipientsConfig', () => getAlertRecipientsConfig()],
]

const writeActionsReturningError: Array<[string, () => Promise<ActionResult<unknown>>]> = [
    ['createCardDraft', () => createCardDraft(card())],
    ['createClientForTechMap', () => createClientForTechMap('Acme')],
    ['createTechnologyUnverified', () => createTechnologyUnverified('Rust')],
    ['setAlertRecipients', () => setAlertRecipients('demand', [])],
]

describe('kontrola dostępu — moduł niedostępny bez guardu lifecycle', () => {
    it.each(readActionsRejecting)('%s (odczyt) rzuca dla użytkownika bez uprawnień', async (_name, run) => {
        authState.allowed = false
        await expect(run()).rejects.toThrow('Brak uprawnień')
    })

    it.each(writeActionsReturningError)(
        '%s (zapis) zwraca {success:false} z treścią guardu',
        async (_name, run) => {
            authState.allowed = false
            const res = await run()
            if (res.success) throw new Error('oczekiwano odmowy uprawnień')
            expect(res.error).toContain('Brak uprawnień')
        },
    )
})

describe('createCardDraft', () => {
    it.each(['tak', 'nie', 'nie_wiem', null] as const)('zapisuje odpowiedź OC %s przy tworzeniu i edycji', async (professionalInsurance) => {
        db.tables.tech_interview_cards = [{ id: 'card-1', contractor_id: 'c-1', tcm_id: 'tcm-1' }]
        expect((await createCardDraft(card({ professionalInsurance }))).success).toBe(true)
        expect(db.inserts.find((i) => i.table === 'tech_interview_cards')?.rows).toMatchObject({
            professional_insurance: professionalInsurance,
        })
        expect((await saveCard('card-1', card({ professionalInsurance }))).success).toBe(true)
        expect(db.updates.find((i) => i.table === 'tech_interview_cards')?.patch).toMatchObject({
            professional_insurance: professionalInsurance,
        })
    })

    it('odrzuca kartę bez klienta (walidacja bazowa)', async () => {
        const res = await createCardDraft(card({ clientId: '' }))
        expect(res).toEqual({ success: false, error: expect.stringContaining('Wybierz klienta') })
    })

    it('zapisuje draft z tcm_id z kontekstu i materializuje przydział bloku', async () => {
        db.tables.tech_interview_cards = [{ id: 'card-1' }]
        const result = await createCardDraft(card({ technologyIds: ['t-1', 't-2'] }))
        expect(result).toEqual({ success: true, data: { id: 'card-1' } })

        const cardInsert = db.inserts.find((i) => i.table === 'tech_interview_cards')
        expect(cardInsert).toBeTruthy()
        const row = cardInsert!.rows as Record<string, unknown>
        expect(row.tcm_id).toBe('tcm-1')
        expect(row.is_draft).toBe(true)

        const junction = db.inserts.find((i) => i.table === 'tech_interview_card_technologies')
        expect(junction).toBeTruthy()
        expect(junction!.rows).toHaveLength(2)
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
        const res = await saveCard('card-1', card())
        expect(res).toEqual({ success: false, error: expect.stringContaining('własne karty') })
    })

    it('admin może edytować cudzą kartę', async () => {
        authState.isAdmin = true
        db.tables.tech_interview_cards = [foreignCard]
        await expect(saveCard('card-1', card())).resolves.toEqual({ success: true, data: undefined })
    })

    it('nie pozwala zmienić konsultanta na istniejącej karcie', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        const res = await saveCard('card-1', card({ contractorId: 'INNY' }))
        expect(res).toEqual({
            success: false,
            error: expect.stringContaining('Nie można zmienić konsultanta'),
        })
    })

    it('finalizacja niekompletnej karty (brak statusu) jest odrzucana', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        const res = await finalizeCard('card-1', card({ status: null }))
        expect(res).toEqual({ success: false, error: expect.stringContaining('Status rozmowy') })
    })

    it('finalizacja kompletnej karty przechodzi i zdejmuje draft', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        await finalizeCard('card-1', card())
        const patch = db.updates.find((u) => u.table === 'tech_interview_cards')?.patch
        expect(patch?.is_draft).toBe(false)
        expect(patch?.finalized_at).toBeTruthy()
    })

    // Phase 49 — tytuł rozmowy
    it('zapisuje przycięty tytuł rozmowy', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        await saveCard('card-1', card({ title: '  Przedłużenie kontraktu  ' }))
        const patch = db.updates.find((u) => u.table === 'tech_interview_cards')?.patch
        expect(patch?.title).toBe('Przedłużenie kontraktu')
    })

    it('wyczyszczony tytuł wraca do NULL (tytuł domyślny), a nie do pustego stringa', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        await saveCard('card-1', card({ title: '   ' }))
        const patch = db.updates.find((u) => u.table === 'tech_interview_cards')?.patch
        expect(patch?.title).toBeNull()
    })

    it('odrzuca tytuł dłuższy niż limit CHECK-a w DB', async () => {
        db.tables.tech_interview_cards = [{ ...foreignCard, tcm_id: 'tcm-1' }]
        const res = await saveCard('card-1', card({ title: 'x'.repeat(121) }))
        expect(res).toEqual({ success: false, error: expect.stringContaining('Tytuł rozmowy') })
    })
})

describe('słownik technologii', () => {
    it('duplikat (23505) zwraca istniejącą pozycję zamiast błędu — tag-picker wybiera kanoniczną', async () => {
        db.insertError = { code: '23505', message: 'duplicate' }
        db.tables.technologies = [{ id: 't-1', name: 'Kubernetes', slug: 'kubernetes' }]
        const res = await createTechnologyUnverified('kubernetes')
        if (!res.success) throw new Error(`oczekiwano sukcesu, dostałem: ${res.error}`)
        expect(res.data.id).toBe('t-1')
    })

    it('edycja słownika wymaga admina', async () => {
        const res = await updateTechnology({ id: 't-1', name: 'Nowa' })
        expect(res).toEqual({ success: false, error: expect.stringContaining('Tylko administrator') })
    })
})

describe('createClientForTechMap', () => {
    it('normalizuje nazwę (trim + zbite spacje) przed zapisem', async () => {
        db.tables.clients = [{ id: 'k-9', name: 'Acme Corp' }]
        const res = await createClientForTechMap('  Acme   Corp ')
        expect(res.success).toBe(true)
        const insert = db.inserts.find((i) => i.table === 'clients')
        expect((insert!.rows as Record<string, unknown>).name).toBe('Acme Corp')
    })

    it('za krótka nazwa wraca jako komunikat dla użytkownika, nie jako wyjątek', async () => {
        const res = await createClientForTechMap(' A ')
        expect(res).toEqual({ success: false, error: expect.stringContaining('za krótka') })
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
