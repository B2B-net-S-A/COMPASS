import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Kontrakt eksportu dni roboczych dla NEXUSA (D5).
 *
 * Test broni trzech rzeczy, z których każda ma konkretny koszt przy złamaniu:
 *  1. własny sekret, NIE `CRON_SECRET` — tamten odblokowuje też
 *     /api/migrate-compliance, czyli DDL na bazie COMPASSA,
 *  2. brak fallbacku na `?secret=` — query stringi lądują w access logach,
 *  3. odpowiedź nie niesie typu nieobecności ani notatek (dane o zdrowiu).
 */

const rpcMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({ rpc: rpcMock }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const SECRET = 'test-workdays-secret-0123456789'

async function call(url: string, headers: Record<string, string> = {}) {
    const { GET } = await import('../route')
    return GET(new NextRequest(url, { headers }))
}

beforeEach(() => {
    vi.resetModules()
    rpcMock.mockReset()
    rpcMock.mockResolvedValue({
        data: [
            {
                email: 'kto.s@b2bnetwork.pl',
                month: '2026-08-01',
                business_days: 21,
                absence_days: '2.5',
                working_days: '18.5',
            },
        ],
        error: null,
    })
    process.env.WORKDAYS_EXPORT_SECRET = SECRET
    process.env.CRON_SECRET = 'zupelnie-inny-sekret-crona'
})

afterEach(() => {
    delete process.env.WORKDAYS_EXPORT_SECRET
    delete process.env.CRON_SECRET
})

describe('GET /api/internal/workdays', () => {
    it('zwraca dni robocze przy poprawnym sekrecie', async () => {
        const res = await call('http://x/api/internal/workdays?from=2026-08&to=2026-08', {
            authorization: `Bearer ${SECRET}`,
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.people).toHaveLength(1)
        expect(body.people[0]).toMatchObject({
            email: 'kto.s@b2bnetwork.pl',
            month: '2026-08',
            business_days: 21,
            absence_days: 2.5,
            working_days: 18.5,
        })
    })

    it('podpisuje liczbę tym, czym ona naprawdę jest', async () => {
        // Chorobowe dla B2B jest w COMPASSIE strukturalnie niezapisywalne,
        // a rekruterzy są w większości B2B — więc to NIE są „dni przepracowane".
        const res = await call('http://x/api/internal/workdays?from=2026-08&to=2026-08', {
            authorization: `Bearer ${SECRET}`,
        })
        expect((await res.json()).basis).toBe('business_days_minus_approved_leave')
    })

    it('NIE oddaje typu nieobecności ani notatek', async () => {
        rpcMock.mockResolvedValue({
            data: [
                {
                    email: 'a@b2bnetwork.pl',
                    month: '2026-08-01',
                    business_days: 21,
                    absence_days: '1.0',
                    working_days: '20.0',
                    leave_type: 'sick_leave',
                    note: 'zabieg w szpitalu',
                },
            ],
            error: null,
        })
        const res = await call('http://x/api/internal/workdays?from=2026-08&to=2026-08', {
            authorization: `Bearer ${SECRET}`,
        })
        const raw = JSON.stringify(await res.json())
        expect(raw).not.toContain('sick_leave')
        expect(raw).not.toContain('szpital')
        expect(raw).not.toContain('leave_type')
    })

    it('odrzuca CRON_SECRET — to inny sekret o innym zasięgu', async () => {
        const res = await call('http://x/api/internal/workdays?from=2026-08&to=2026-08', {
            authorization: 'Bearer zupelnie-inny-sekret-crona',
        })
        expect(res.status).toBe(401)
    })

    it('NIE przyjmuje sekretu z query stringa', async () => {
        const res = await call(
            `http://x/api/internal/workdays?from=2026-08&to=2026-08&secret=${SECRET}`,
        )
        expect(res.status).toBe(401)
    })

    it('bez konfiguracji zwraca 503, nie 401', async () => {
        delete process.env.WORKDAYS_EXPORT_SECRET
        const res = await call('http://x/api/internal/workdays?from=2026-08&to=2026-08', {
            authorization: `Bearer ${SECRET}`,
        })
        expect(res.status).toBe(503)
    })

    it('waliduje zakres miesięcy', async () => {
        const bad = await call('http://x/api/internal/workdays?from=sierpien&to=2026-08', {
            authorization: `Bearer ${SECRET}`,
        })
        expect(bad.status).toBe(422)

        const reversed = await call('http://x/api/internal/workdays?from=2026-09&to=2026-08', {
            authorization: `Bearer ${SECRET}`,
        })
        expect(reversed.status).toBe(422)

        const tooWide = await call('http://x/api/internal/workdays?from=2020-01&to=2026-08', {
            authorization: `Bearer ${SECRET}`,
        })
        expect(tooWide.status).toBe(422)
    })
})
