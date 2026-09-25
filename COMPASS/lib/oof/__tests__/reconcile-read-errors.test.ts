import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient } from '@/test/mocks/supabase'

/**
 * Audyt 2026-09-22 — INT-08 (ślepy przebieg liczony, a nie „0 nieobecności")
 * i INT-02 (cron ustawia OOF odroczony przy akceptacji, gdy przyjdzie jego kolej).
 */

const graphOof = vi.hoisted(() => ({
    readCurrentOof: vi.fn(),
    setOutOfOffice: vi.fn(),
}))

vi.mock('@/lib/mailbox/graph-oof', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/mailbox/graph-oof')>()
    return {
        ...actual,
        readCurrentOof: graphOof.readCurrentOof,
        setOutOfOffice: graphOof.setOutOfOffice,
    }
})
vi.mock('@/lib/audit/system-log', () => ({ logSystemAudit: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { reconcileOutlookOof } from '../reconcile'

const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(new Date())

function profile(id: string, email: string) {
    return {
        id,
        email,
        full_name: `Osoba ${id}`,
        role: 'internal',
        employment_type: 'uop',
        employment_status: 'active',
        leave_entitlement_days: 26,
        leave_carried_over_days: 0,
        leave_used_initial_days: 0,
        created_at: '2026-01-01',
    }
}

function db(leaves: Record<string, unknown>[] = []) {
    return createMockSupabaseClient({
        tables: {
            profiles: [profile('u1', 'a@b2bnetwork.pl'), profile('u2', 'b@b2bnetwork.pl')],
            leave_requests: leaves,
            public_holidays: [],
        },
    })
}

beforeEach(() => {
    graphOof.readCurrentOof.mockReset()
    graphOof.setOutOfOffice.mockReset()
    process.env.OOF_RECONCILE_ACTOR_ID = 'actor'
})

describe('reconcileOutlookOof', () => {
    it('INT-08: wszystkie odczyty padły → readErrors === scanned', async () => {
        graphOof.readCurrentOof.mockResolvedValue({ ok: false, error: 'Forbidden', statusCode: 403 })
        const stats = await reconcileOutlookOof(db())
        expect(stats.scanned).toBe(2)
        expect(stats.readErrors).toBe(2)
        expect(stats.errors).toHaveLength(2)
    })

    it('konto bez skrzynki Exchange nie jest błędem odczytu', async () => {
        graphOof.readCurrentOof
            .mockResolvedValueOnce({ ok: false, error: 'no mailbox', statusCode: 404, noMailbox: true })
            .mockResolvedValueOnce({ ok: true, state: { status: 'disabled' } })
        const stats = await reconcileOutlookOof(db())
        expect(stats).toMatchObject({ scanned: 1, readErrors: 0, noMailbox: 1 })
        expect(stats.errors).toEqual([])
    })

    it('konto bez skrzynki nie maskuje ślepego przebiegu', async () => {
        graphOof.readCurrentOof
            .mockResolvedValueOnce({ ok: false, error: 'no mailbox', statusCode: 404, noMailbox: true })
            .mockResolvedValueOnce({ ok: false, error: 'Forbidden', statusCode: 403 })
        const stats = await reconcileOutlookOof(db())
        expect(stats.readErrors).toBe(stats.scanned)
        expect(stats.scanned).toBe(1)
    })

    it('INT-08: wyłączony OOF to udany odczyt, nie błąd', async () => {
        graphOof.readCurrentOof.mockResolvedValue({ ok: true, state: { status: 'disabled' } })
        const stats = await reconcileOutlookOof(db())
        expect(stats).toMatchObject({ scanned: 2, readErrors: 0 })
    })

    it('INT-02: odroczony urlop dostaje OOF, gdy skrzynka jest wolna', async () => {
        graphOof.readCurrentOof.mockResolvedValue({ ok: true, state: { status: 'disabled' } })
        graphOof.setOutOfOffice.mockResolvedValue({ success: true })
        const client = db([
            {
                id: 'l1',
                user_id: 'u1',
                status: 'approved',
                start_date: today,
                end_date: today,
                half_day: null,
                substitute_id: null,
                graph_oof_set: false,
                graph_oof_skip_reason: null,
                oof_internal_message: 'Własny tekst',
                oof_external_message: null,
            },
        ])
        const stats = await reconcileOutlookOof(client)
        expect(graphOof.setOutOfOffice).toHaveBeenCalledTimes(1)
        expect(graphOof.setOutOfOffice.mock.calls[0][0]).toMatchObject({
            userEmail: 'a@b2bnetwork.pl',
            startDate: today,
            internalReply: 'Własny tekst',
        })
        expect(stats.deferredOofSet).toBe(1)
        expect(client._tables.leave_requests[0]).toMatchObject({ graph_oof_set: true })
    })

    it('INT-02: urlop z zachowaną własną odpowiedzią (user_custom) nie jest ruszany', async () => {
        graphOof.readCurrentOof.mockResolvedValue({ ok: true, state: { status: 'disabled' } })
        await reconcileOutlookOof(
            db([
                {
                    id: 'l1',
                    user_id: 'u1',
                    status: 'approved',
                    start_date: today,
                    end_date: today,
                    half_day: null,
                    substitute_id: null,
                    graph_oof_set: false,
                    graph_oof_skip_reason: 'user_custom',
                    oof_internal_message: null,
                    oof_external_message: null,
                },
            ]),
        )
        expect(graphOof.setOutOfOffice).not.toHaveBeenCalled()
    })
})
