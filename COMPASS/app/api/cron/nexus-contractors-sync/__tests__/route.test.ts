import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient, type MockSupabase, type Row, type TableData } from '@/test/mocks/supabase'

/**
 * Cron synchronizacji kontraktorów z NEXUSEM — kontrakt wyniku (audyt
 * integracji 14.09, INT-07).
 *
 * Dawniej każdy błąd UPDATE był logowany, pętla szła dalej, a odpowiedź miała
 * zawsze `ok: true` i HTTP 200 — reprodukcja awarii WSZYSTKICH zapisów dawała
 * zielony przebieg. Teraz `written` liczy wyłącznie skuteczne zapisy, a każdy
 * nieudany zapis daje HTTP 500 z `ok:false`.
 */

const state = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => state.db,
}))
vi.mock('@/lib/audit/cron-heartbeat', () => ({
    withCronHeartbeat: (_action: string, handler: unknown) => handler,
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const SECRET = 'cron-secret-for-tests'
const URL_BASE = 'https://compass.dynaminds.pl/api/cron/nexus-contractors-sync'

function nexusItem(id: number, candidateId: number, name: string, lastname: string, email: string | null) {
    return {
        nexus_contract_id: id,
        candidate: { id: candidateId, name, lastname, email },
        client_id: 3,
        client_name: 'Bank',
        job_title: 'Java Developer',
        status: 'active',
        start_date: '2026-01-01',
        end_date: null,
        lacks_current_order: false,
        updated_at: '2026-09-01T10:00:00Z',
    }
}

type Failure = { table: string; op: 'update' | 'upsert' | 'delete'; code?: string; when?: (payload: Record<string, unknown>) => boolean }

/** Nakłada awarie zapisu na atrapę Supabase — atrapa sama błędów nie zna. */
function withFailures(db: MockSupabase, failures: Failure[]): MockSupabase {
    const failingBuilder = (error: { message: string; code?: string }) => {
        const b: Record<string, unknown> = {}
        for (const m of ['eq', 'in', 'neq', 'lt', 'is', 'select']) b[m] = () => b
        b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error })
        return b
    }
    const originalFrom = db.from
    const from = vi.fn((table: string) => {
        const builder = originalFrom(table)
        for (const op of ['update', 'upsert', 'delete'] as const) {
            const original = builder[op]
            builder[op] = (payload?: unknown, ...rest: unknown[]) => {
                const hit = failures.find(
                    (f) => f.table === table && f.op === op && (!f.when || f.when((payload ?? {}) as Record<string, unknown>)),
                )
                if (hit) return failingBuilder({ message: `awaria ${op} ${table}`, code: hit.code })
                return original(payload, ...rest)
            }
        }
        return builder
    })
    return { ...db, from } as unknown as MockSupabase
}

async function call() {
    const { GET } = await import('../route')
    return GET(new NextRequest(URL_BASE, { headers: { authorization: `Bearer ${SECRET}` } }))
}

function seed(tables: TableData, failures: Failure[] = []) {
    const db = createMockSupabaseClient({ tables })
    state.db = withFailures(db, failures)
    return db
}

beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = SECRET
    process.env.NEXUS_CONTRACTORS_URL = 'https://nexus.example/api/integrations/compass/contractors'
    process.env.NEXUS_CONTRACTORS_API_KEY = 'nexus-key'
    vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
            new Response(
                JSON.stringify({
                    items: [
                        nexusItem(11, 110, 'Jan', 'Kowalski', 'jan@example.com'),
                        nexusItem(21, 210, 'Anna', 'Nowak', null),
                    ],
                    page: 1,
                    page_size: 200,
                    total: 2,
                    has_more: false,
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        ),
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.CRON_SECRET
    delete process.env.NEXUS_CONTRACTORS_URL
    delete process.env.NEXUS_CONTRACTORS_API_KEY
})

const contractors = (): Row[] => [
    { id: 'c1', full_name: 'Jan Kowalski', email: 'jan@example.com', nexus_contract_id: null, nexus_candidate_id: null, nexus_match_status: null, nexus_match_reason: null },
    { id: 'c2', full_name: 'Anna Nowak', email: null, nexus_contract_id: null, nexus_candidate_id: null, nexus_match_status: 'auto_not_found', nexus_match_reason: null },
    { id: 'c3', full_name: 'Piotr Zieliński', email: null, nexus_contract_id: null, nexus_candidate_id: null, nexus_match_status: null, nexus_match_reason: null },
    { id: 'c4', full_name: 'Ewa Wiśniewska', email: null, nexus_contract_id: null, nexus_candidate_id: null, nexus_match_status: 'dismissed', nexus_match_reason: 'sprzed wdrożenia' },
]

describe('GET /api/cron/nexus-contractors-sync', () => {
    it('udany bieg: ok, zapisuje werdykty, migawkę i nie rusza ręcznego odrzucenia', async () => {
        const db = seed({
            contractors: contractors(),
            nexus_contract_snapshot: [{ nexus_contract_id: 999, nexus_candidate_id: 9, seen_at: '2020-01-01T00:00:00.000Z' }],
        })
        const res = await call()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toMatchObject({ ok: true, failed: 0, conflicts: 0, linked: 1, pending: 1, auto_not_found: 1, dismissed: 1 })
        expect(body.written).toBe(3)

        const byId = Object.fromEntries(db._tables.contractors.map((r) => [r.id, r]))
        expect(byId.c1).toMatchObject({ nexus_match_status: 'linked', nexus_contract_id: 11, nexus_candidate_id: 110 })
        expect(byId.c2).toMatchObject({ nexus_match_status: 'pending' })
        expect(byId.c3).toMatchObject({ nexus_match_status: 'auto_not_found' })
        expect(byId.c4).toMatchObject({ nexus_match_status: 'dismissed', nexus_match_reason: 'sprzed wdrożenia' })

        // Migawka = dokładnie ostatni kompletny eksport; stary kontrakt usunięty.
        expect(db._tables.nexus_contract_snapshot.map((r) => r.nexus_contract_id).sort()).toEqual([11, 21])
    })

    it('błąd jednej grupy: HTTP 500, ok:false, written liczy tylko skuteczne zapisy', async () => {
        seed({ contractors: contractors(), nexus_contract_snapshot: [] }, [
            { table: 'contractors', op: 'update', when: (p) => p.nexus_match_status === 'pending' },
        ])
        const res = await call()
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body).toMatchObject({ ok: false, stage: 'write', failed: 1, conflicts: 0, written: 2 })
    })

    it('konflikt unikalności (23505) jest liczony osobno i też daje ok:false', async () => {
        seed({ contractors: contractors(), nexus_contract_snapshot: [] }, [
            { table: 'contractors', op: 'update', code: '23505', when: (p) => p.nexus_match_status === 'linked' },
        ])
        const res = await call()
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body).toMatchObject({ ok: false, failed: 1, conflicts: 1 })
    })

    it('awaria wszystkich zapisów: 500, ok:false, written 0 (reprodukcja z audytu)', async () => {
        seed({ contractors: contractors(), nexus_contract_snapshot: [] }, [{ table: 'contractors', op: 'update' }])
        const res = await call()
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body).toMatchObject({ ok: false, written: 0, failed: 3 })
    })

    it('awaria zapisu migawki: 500 i żadnego usuwania starych wierszy', async () => {
        const db = seed(
            {
                contractors: contractors(),
                nexus_contract_snapshot: [{ nexus_contract_id: 999, nexus_candidate_id: 9, seen_at: '2020-01-01T00:00:00.000Z' }],
            },
            [{ table: 'nexus_contract_snapshot', op: 'upsert' }],
        )
        const res = await call()
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body).toMatchObject({ ok: false, stage: 'snapshot', snapshot_failed: true })
        expect(db._tables.nexus_contract_snapshot.map((r) => r.nexus_contract_id)).toEqual([999])
    })

    it('drugi bieg bez zmian nie przepisuje powiązanych wierszy', async () => {
        const rows = contractors()
        rows[0] = { ...rows[0], nexus_match_status: 'linked', nexus_contract_id: 11, nexus_candidate_id: 110 }
        seed({ contractors: rows, nexus_contract_snapshot: [] }, [
            { table: 'contractors', op: 'update', when: (p) => p.nexus_match_status === 'linked' },
        ])
        const res = await call()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.unchanged).toBeGreaterThanOrEqual(2)
    })

    it('strona bez logicznego has_more blokuje zapis i prune migawki (INT-18)', async () => {
        const db = seed({
            contractors: contractors(),
            nexus_contract_snapshot: [{ nexus_contract_id: 999, nexus_candidate_id: 9, seen_at: '2020-01-01T00:00:00.000Z' }],
        })
        const before = JSON.parse(JSON.stringify(db._tables.contractors))
        for (const hasMore of [undefined, 'false', null]) {
            vi.stubGlobal(
                'fetch',
                vi.fn(async () =>
                    new Response(
                        JSON.stringify({ items: [nexusItem(11, 110, 'Jan', 'Kowalski', 'jan@example.com')], has_more: hasMore }),
                        { status: 200 },
                    ),
                ),
            )
            const res = await call()
            expect(res.status).toBe(500)
            expect(await res.json()).toMatchObject({ ok: false, stage: 'fetch' })
        }
        expect(db._tables.nexus_contract_snapshot.map((r) => r.nexus_contract_id)).toEqual([999])
        expect(db._tables.contractors).toEqual(before)
    })

    it('pozycja eksportu bez candidate.id blokuje przebieg (INT-18)', async () => {
        seed({ contractors: contractors(), nexus_contract_snapshot: [] })
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                new Response(JSON.stringify({ items: [{ nexus_contract_id: 11, candidate: null }], has_more: false }), {
                    status: 200,
                }),
            ),
        )
        const res = await call()
        expect(res.status).toBe(500)
        expect(await res.json()).toMatchObject({ ok: false, stage: 'fetch' })
    })

    it('ręczna decyzja podjęta między odczytem a zapisem wygrywa z automatem (INT-17)', async () => {
        const db = createMockSupabaseClient({ tables: { contractors: contractors(), nexus_contract_snapshot: [] } })
        // Symulacja wyścigu: zaraz po tym, jak cron przeczyta `contractors`, TCM
        // odrzuca c2 („nie ma w NEXUSIE") i ręcznie łączy c1 z inną osobą.
        const originalFrom = db.from
        let raced = false
        const from = vi.fn((table: string) => {
            const builder = originalFrom(table)
            if (table !== 'contractors' || raced) return builder
            const originalSelect = builder.select
            builder.select = (...args: unknown[]) => {
                const q = originalSelect(...args)
                const originalThen = q.then
                q.then = (resolve: (v: unknown) => void) =>
                    originalThen((result: unknown) => {
                        raced = true
                        const rows = db._tables.contractors
                        Object.assign(rows.find((r) => r.id === 'c2')!, {
                            nexus_match_status: 'dismissed',
                            nexus_match_reason: 'ręcznie',
                        })
                        Object.assign(rows.find((r) => r.id === 'c1')!, {
                            nexus_match_status: 'linked',
                            nexus_contract_id: 21,
                            nexus_candidate_id: 210,
                        })
                        resolve(result)
                    })
                return q
            }
            return builder
        })
        state.db = { ...db, from }

        const res = await call()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toMatchObject({ ok: true, failed: 0, skipped_concurrent: 2 })

        const byId = Object.fromEntries(db._tables.contractors.map((r) => [r.id, r]))
        expect(byId.c1).toMatchObject({ nexus_match_status: 'linked', nexus_contract_id: 21, nexus_candidate_id: 210 })
        expect(byId.c2).toMatchObject({ nexus_match_status: 'dismissed', nexus_match_reason: 'ręcznie' })
        // Wiersz bez wyścigu zapisany normalnie.
        expect(byId.c3).toMatchObject({ nexus_match_status: 'auto_not_found' })
    })

    it('pusty eksport to awaria, nie „nie ma kontraktorów"', async () => {
        seed({ contractors: contractors(), nexus_contract_snapshot: [] })
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ items: [], has_more: false }), { status: 200 })),
        )
        const res = await call()
        expect(res.status).toBe(500)
        expect((await res.json()).ok).toBe(false)
    })
})
