import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient } from '@/test/mocks/supabase'
import type { SuccessAdminClient, SuccessDeliveryRow } from '../types'

/**
 * Audyt 2026-09-22, INT-20 — fencing ACK po `claimed_by`.
 *
 * Stary worker (A), któremu wygasł lease, nie może ani zacząć nowej wysyłki,
 * ani nadpisać stanu wiersza przejętego przez nowego workera (B).
 */

const deliverMock = vi.hoisted(() => vi.fn())
vi.mock('../delivery', () => ({ deliverSuccessDelivery: deliverMock }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

// 12:00 w Warszawie — poza ciszą nocną.
const NOW = new Date('2026-09-22T10:00:00Z')
const LEASE_OK = '2026-09-22T10:05:00Z'

function row(overrides: Partial<SuccessDeliveryRow & { claimed_by: string; status: string }>) {
    return {
        id: 'd1',
        delivery_kind: 'task_due',
        entity_id: 'task-1',
        contractor_id: 'c1',
        recipient_user_id: 'u1',
        recipient_email: null,
        channel: 'in_app',
        dedupe_key: 'task:task-1:due:2026-09-22:u1',
        available_at: '2026-09-22T09:00:00Z',
        status: 'processing',
        attempt_count: 1,
        max_attempts: 5,
        lease_expires_at: LEASE_OK,
        payload: null,
        claimed_by: 'worker-a',
        ...overrides,
    }
}

async function run(tableRows: ReturnType<typeof row>[], claimed: ReturnType<typeof row>[], clock = () => NOW.getTime()) {
    const db = createMockSupabaseClient({
        tables: { contractor_success_deliveries: tableRows },
        rpcs: { claim_contractor_success_deliveries: () => claimed },
    })
    const { runConsultantSuccessDispatcher } = await import('../dispatcher')
    const stats = await runConsultantSuccessDispatcher({
        admin: db as unknown as SuccessAdminClient,
        workerId: 'worker-a',
        now: NOW,
        clock,
    })
    return { db, stats }
}

beforeEach(() => {
    deliverMock.mockReset()
    deliverMock.mockResolvedValue({ disposition: 'sent' })
})

describe('dispatcher — fencing ACK (INT-20)', () => {
    it('worker trzymający lease potwierdza wysyłkę', async () => {
        const { db, stats } = await run([row({})], [row({})])
        expect(deliverMock).toHaveBeenCalledTimes(1)
        expect(stats).toMatchObject({ sent: 1, lostLease: 0 })
        expect(db._tables.contractor_success_deliveries[0]).toMatchObject({ status: 'sent' })
    })

    it('ACK starego workera nie nadpisuje wiersza przejętego przez nowego', async () => {
        // Claim oddał wiersz A, ale zanim A skończył, lease wygasł i B go przejął.
        const inDb = row({ claimed_by: 'worker-b', lease_expires_at: '2026-09-22T10:10:00Z', attempt_count: 2 })
        const { db, stats } = await run([inDb], [row({})])
        expect(stats).toMatchObject({ sent: 0, lostLease: 1, errors: 0 })
        expect(db._tables.contractor_success_deliveries[0]).toMatchObject({
            status: 'processing',
            claimed_by: 'worker-b',
            attempt_count: 2,
        })
    })

    it('wygasły lease przed wysyłką: brak wysyłki i brak ACK', async () => {
        const expired = row({ lease_expires_at: '2026-09-22T09:59:00Z' })
        const { db, stats } = await run([expired], [expired])
        expect(deliverMock).not.toHaveBeenCalled()
        expect(stats).toMatchObject({ sent: 0, lostLease: 1 })
        expect(db._tables.contractor_success_deliveries[0]).toMatchObject({ status: 'processing' })
    })

    it('lease wygasa w trakcie batcha — kolejna dostawa nie rusza (zegar sprawdzany per sztuka)', async () => {
        const rows = [row({ id: 'd1' }), row({ id: 'd2' })]
        let calls = 0
        // Pierwsze sprawdzenie przed lease, drugie już po nim.
        const clock = () => (calls++ === 0 ? NOW.getTime() : Date.parse(LEASE_OK) + 1)
        const { stats } = await run(rows, rows, clock)
        expect(deliverMock).toHaveBeenCalledTimes(1)
        expect(stats).toMatchObject({ sent: 1, lostLease: 1 })
    })
})
