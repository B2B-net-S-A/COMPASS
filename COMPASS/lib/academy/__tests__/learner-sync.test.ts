import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_EXPIRIES_PER_RUN, planLearnerSync, type SyncAccount, type SyncContract } from '../learner-sync'

const contract = (id: number, email: string | null, name = 'Anna', lastname = 'Nowak'): SyncContract => ({ nexus_candidate_id: id, email, name, lastname })
const account = (id: string, email: string, patch: Partial<SyncAccount> = {}): SyncAccount => ({ id, email, source: 'umowa', source_ref: null, disappeared_at: null, ended_at: null, ...patch })

describe('planLearnerSync', () => {
    it('liczy nowe konta z aktywnych umów i normalizuje adres', () => {
        const plan = planLearnerSync([contract(1, ' Anna@Example.TEST ')], [])
        expect(plan.counts.new).toBe(1)
        expect(plan.inserts).toEqual([{ email: 'anna@example.test', full_name: 'Anna Nowak', source: 'umowa', source_ref: '1' }])
    })

    it('kilka umów tej samej osoby daje jedno konto', () => {
        expect(planLearnerSync([contract(1, 'a@example.test'), contract(1, 'A@example.test')], []).inserts).toHaveLength(1)
    })

    it('adres dwóch różnych osób to konflikt, nikt nie dostaje konta', () => {
        const plan = planLearnerSync([contract(1, 'wspolny@example.test'), contract(2, 'wspolny@example.test')], [])
        expect(plan.counts.conflicts).toBe(1)
        expect(plan.inserts).toEqual([])
    })

    it('konto przypisane do innej osoby NEXUSA to konflikt', () => {
        const plan = planLearnerSync([contract(2, 'a@example.test')], [account('x', 'a@example.test', { source_ref: '1' })])
        expect(plan.counts.conflicts).toBe(1)
    })

    it('nie dopasowuje po nazwisku', () => {
        const plan = planLearnerSync([contract(1, 'inny@example.test', 'Anna', 'Nowak')], [account('x', 'anna@example.test')])
        expect(plan.counts).toMatchObject({ new: 1, expired: 1 })
    })

    it('pomija adresy puste, błędne i firmowe', () => {
        const plan = planLearnerSync([contract(1, null), contract(2, '  '), contract(3, 'bez-malpy'), contract(4, 'x@b2bnetwork.pl')], [])
        expect(plan.counts).toMatchObject({ no_email: 3, excluded_domain: 1, new: 0 })
    })

    it('wygasza tylko konta z umowy', () => {
        const plan = planLearnerSync([contract(1, 'a@example.test')], [
            account('proba', 'proba@example.test', { source: 'proba' }),
            account('reczne', 'reczne@example.test', { source: 'reczne' }),
            account('umowa', 'koniec@example.test'),
            account('zakonczone', 'stare@example.test', { ended_at: '2026-01-01T00:00:00Z' }),
            account('zniknelo', 'wczesniej@example.test', { disappeared_at: '2026-01-01T00:00:00Z' }),
        ])
        expect(plan.expiredIds).toEqual(['umowa'])
    })

    it('zwraca konto, które wróciło do aktywnych umów', () => {
        const plan = planLearnerSync([contract(1, 'a@example.test')], [account('x', 'a@example.test', { disappeared_at: '2026-01-01T00:00:00Z' })])
        expect(plan.returnedIds).toEqual(['x'])
    })

    it('pusta migawka nie wygasza nikogo', () => {
        const plan = planLearnerSync([], [account('x', 'a@example.test')])
        expect(plan.refusal).toBe('empty_snapshot')
        expect(plan.expiredIds).toEqual([])
    })

    const many = Array.from({ length: MAX_EXPIRIES_PER_RUN + 1 }, (_, index) => account(`k${index}`, `k${index}@example.test`))

    it('dopuszcza dokładnie limit wygaszeń', () => {
        expect(planLearnerSync([contract(1, 'a@example.test')], many.slice(0, MAX_EXPIRIES_PER_RUN)).refusal).toBeNull()
    })

    it('ponad limit czeka na człowieka i nie zmienia niczego', () => {
        const plan = planLearnerSync([contract(1, 'a@example.test')], many)
        expect(plan.refusal).toBe('mass_expiry')
        expect(plan).toMatchObject({ inserts: [], expiredIds: [], returnedIds: [] })
        expect(plan.counts.expired).toBe(many.length)
    })

    it('zatwierdzenie wymaga dokładnej liczby', () => {
        expect(planLearnerSync([contract(1, 'a@example.test')], many, { confirmExpiries: many.length + 1 }).refusal).toBe('mass_expiry')
        expect(planLearnerSync([contract(1, 'a@example.test')], many, { confirmExpiries: many.length }).expiredIds).toHaveLength(many.length)
    })
})

const db = vi.hoisted(() => ({
    contracts: [] as unknown[],
    accounts: [] as unknown[] | null,
    accountsError: null as { code: string } | null,
    insert: vi.fn(async () => ({ error: null as { code: string } | null })),
    update: vi.fn(() => ({ in: async () => ({ error: null }) })),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/audit/cron-heartbeat', () => ({ withCronHeartbeat: (_action: string, handler: unknown) => handler }))
vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        from: (table: string) => {
            const isSnapshot = table === 'nexus_contract_snapshot'
            const query = {
                select: () => query,
                order: () => query,
                range: async () => isSnapshot ? { data: db.contracts, error: null } : { data: db.accounts, error: db.accountsError },
                insert: db.insert,
                update: db.update,
            }
            return query
        },
    }),
}))

describe('GET /api/cron/academy-learners-sync', () => {
    const call = async (query = '') => {
        const { GET } = await import('@/app/api/cron/academy-learners-sync/route')
        const response = await GET(new NextRequest(`https://compass.test/api/cron/academy-learners-sync${query}`, { headers: { authorization: 'Bearer sekret' } }))
        return { status: response.status, text: await response.text() }
    }

    beforeEach(() => {
        vi.stubEnv('CRON_SECRET', 'sekret')
        vi.stubEnv('ACADEMY_LEARNER_SYNC_ENABLED', '')
        db.contracts = [contract(1, 'poufny@example.test')]
        db.accounts = [account('x', 'odchodzacy@example.test')]
        db.accountsError = null
        db.insert.mockClear()
        db.update.mockClear()
    })

    it('przy wyłączonym przełączniku zapisuje 0 wierszy i podaje liczby', async () => {
        const { status, text } = await call()
        expect(status).toBe(200)
        expect(JSON.parse(text)).toMatchObject({ ok: true, enabled: false, written: 0, counts: { new: 1, expired: 1 } })
        expect(db.insert).not.toHaveBeenCalled()
        expect(db.update).not.toHaveBeenCalled()
    })

    it('odpowiedź nie niesie adresów ani nazwisk', async () => {
        const { text } = await call()
        expect(text).not.toContain('example.test')
        expect(text).not.toContain('Nowak')
    })

    it('tylko dosłowne true włącza zapis', async () => {
        vi.stubEnv('ACADEMY_LEARNER_SYNC_ENABLED', '1')
        expect(JSON.parse((await call()).text).written).toBe(0)
        vi.stubEnv('ACADEMY_LEARNER_SYNC_ENABLED', 'true')
        expect(JSON.parse((await call()).text).written).toBe(2)
        expect(db.insert).toHaveBeenCalledTimes(1)
    })

    it('przed migracją liczy i niczego nie zapisuje', async () => {
        vi.stubEnv('ACADEMY_LEARNER_SYNC_ENABLED', 'true')
        db.accounts = null
        db.accountsError = { code: '42P01' }
        const { status, text } = await call()
        expect(status).toBe(200)
        expect(JSON.parse(text)).toMatchObject({ migration_pending: true, written: 0 })
        expect(db.insert).not.toHaveBeenCalled()
    })

    it('nieudany zapis daje 500', async () => {
        vi.stubEnv('ACADEMY_LEARNER_SYNC_ENABLED', 'true')
        db.insert.mockResolvedValueOnce({ error: { code: '23505' } })
        const { status, text } = await call()
        expect(status).toBe(500)
        expect(JSON.parse(text)).toMatchObject({ ok: false, failed: 1 })
    })

    it('odrzuca wywołanie bez sekretu', async () => {
        const { GET } = await import('@/app/api/cron/academy-learners-sync/route')
        expect((await GET(new NextRequest('https://compass.test/api/cron/academy-learners-sync'))).status).toBe(401)
    })
})
