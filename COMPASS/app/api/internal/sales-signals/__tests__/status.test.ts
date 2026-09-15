import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient, type MockSupabase } from '@/test/mocks/supabase'

/**
 * Zwrot statusu sygnału z ATLASA (POST /api/internal/sales-signals/status).
 *
 * Kontrakt z ATLASEM musi się zgadzać co do pola:
 *  - własny sekret SALES_SIGNALS_STATUS_SECRET (503 bez niego, 401 przy złym),
 *    NIE sekret eksportu — ta trasa pisze,
 *  - paczka ≤ 200, 422 przy złym kształcie,
 *  - zapis tylko gdy handled_at >= zapisany,
 *  - nieznany signal_id nie jest błędem → `unknown`.
 */

const state = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => state.db }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const SECRET = 'status-secret-0123456789abcdef'
const URL_BASE = 'https://compass.dynaminds.pl/api/internal/sales-signals/status'
const CARD_A = '11111111-1111-4111-8111-111111111111'
const CARD_B = '22222222-2222-4222-8222-222222222222'
const UNKNOWN_CARD = '33333333-3333-4333-8333-333333333333'

let db: MockSupabase

function update(overrides: Record<string, unknown> = {}) {
    return {
        signal_id: CARD_A,
        status: 'converted',
        deal_id: 'deal-42',
        deal_title: 'Nordea — 3x Java',
        handled_by_name: 'Sprzedawca Jan',
        handled_by_email: 'jan@dynaminds.pl',
        reason: null,
        handled_at: '2026-09-15T10:00:00Z',
        ...overrides,
    }
}

async function post(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
    const { POST } = await import('../status/route')
    return POST(
        new NextRequest(URL_BASE, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
    )
}

beforeEach(() => {
    vi.resetModules()
    process.env.SALES_SIGNALS_STATUS_SECRET = SECRET
    process.env.SALES_SIGNALS_EXPORT_SECRET = 'export-secret-inny'
    db = createMockSupabaseClient({
        tables: {
            tech_interview_cards: [{ id: CARD_A }, { id: CARD_B }],
            tech_card_sales_status: [
                {
                    card_id: CARD_B,
                    status: 'converted',
                    atlas_deal_title: 'Nowszy deal',
                    handled_at: '2026-09-15T12:00:00.000Z',
                },
            ],
        },
    })
    state.db = db
})

afterEach(() => {
    delete process.env.SALES_SIGNALS_STATUS_SECRET
    delete process.env.SALES_SIGNALS_EXPORT_SECRET
})

describe('POST /api/internal/sales-signals/status', () => {
    it('bez konfiguracji zwraca 503, nie 401', async () => {
        delete process.env.SALES_SIGNALS_STATUS_SECRET
        expect((await post({ updates: [update()] })).status).toBe(503)
    })

    it('odrzuca zły sekret, brak nagłówka i sekret eksportu', async () => {
        expect((await post({ updates: [update()] }, { authorization: 'Bearer zly' })).status).toBe(401)
        expect((await post({ updates: [update()] }, {})).status).toBe(401)
        expect(
            (await post({ updates: [update()] }, { authorization: 'Bearer export-secret-inny' })).status,
        ).toBe(401)
        expect(db._tables.tech_card_sales_status).toHaveLength(1)
    })

    it('zapisuje nowy status i zwraca liczniki', async () => {
        const res = await post({ updates: [update()] })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ accepted: 1, ignored_stale: 0, unknown: [] })
        const saved = db._tables.tech_card_sales_status.find((r) => r.card_id === CARD_A)
        expect(saved).toMatchObject({
            status: 'converted',
            atlas_deal_id: 'deal-42',
            atlas_deal_title: 'Nordea — 3x Java',
            handled_by_email: 'jan@dynaminds.pl',
            handled_at: '2026-09-15T10:00:00.000Z',
        })
    })

    it('starszy handled_at nie nadpisuje nowszego (odporność na kolejność)', async () => {
        const res = await post({
            updates: [update({ signal_id: CARD_B, status: 'archived', reason: 'stare', handled_at: '2026-09-15T11:00:00Z' })],
        })
        expect(await res.json()).toEqual({ accepted: 0, ignored_stale: 1, unknown: [] })
        const saved = db._tables.tech_card_sales_status.find((r) => r.card_id === CARD_B)
        expect(saved).toMatchObject({ status: 'converted', atlas_deal_title: 'Nowszy deal' })
    })

    it('ten sam handled_at jest akceptowany (powtórka paczki jest idempotentna)', async () => {
        const res = await post({
            updates: [update({ signal_id: CARD_B, status: 'archived', reason: 'nie dla nas', handled_at: '2026-09-15T12:00:00Z' })],
        })
        expect(await res.json()).toMatchObject({ accepted: 1, ignored_stale: 0 })
    })

    it('nieznany signal_id nie jest błędem — trafia do unknown', async () => {
        const res = await post({ updates: [update({ signal_id: UNKNOWN_CARD }), update({ signal_id: 'nie-uuid' })] })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.accepted).toBe(0)
        expect(body.unknown.sort()).toEqual(['nie-uuid', UNKNOWN_CARD].sort())
    })

    it('422 przy złym statusie, złej dacie, niepoprawnym JSON i paczce > 200', async () => {
        expect((await post({ updates: [update({ status: 'won' })] })).status).toBe(422)
        expect((await post({ updates: [update({ handled_at: 'wczoraj' })] })).status).toBe(422)
        expect((await post('{nie json')).status).toBe(422)
        expect((await post({ updates: Array.from({ length: 201 }, () => update()) })).status).toBe(422)
        expect((await post({ nie_updates: [] })).status).toBe(422)
    })
})
