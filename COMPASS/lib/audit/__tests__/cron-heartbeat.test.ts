import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const logSystemAudit = vi.fn(async () => undefined)
vi.mock('@/lib/audit/system-log', () => ({
    logSystemAudit: (...a: unknown[]) => logSystemAudit(...(a as [])),
}))

import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { admin: {} as any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = {} as any

function entries() {
    return logSystemAudit.mock.calls as unknown as Array<
        [string | null, string, Record<string, unknown>]
    >
}

describe('withCronHeartbeat', () => {
    beforeEach(() => {
        logSystemAudit.mockClear()
    })

    it('zostawia parę start/done ze statystykami z ciała odpowiedzi', async () => {
        const handler = withCronHeartbeat('TC_SYNC_RUN', async () =>
            NextResponse.json({ ok: true, imported: 3 }),
        )
        const res = await handler(req, ctx)

        expect(res.status).toBe(200)
        const calls = entries()
        expect(calls).toHaveLength(2)
        expect(calls[0][0]).toBeNull()
        expect(calls[0][1]).toBe('TC_SYNC_RUN')
        expect(calls[0][2].phase).toBe('start')
        expect(calls[1][2]).toMatchObject({
            phase: 'done',
            status: 200,
            stats: { ok: true, imported: 3 },
        })
    })

    it('ciało odpowiedzi zostaje czytelne dla wołającego mimo podejrzenia w heartbeacie', async () => {
        const handler = withCronHeartbeat('TC_SYNC_RUN', async () => NextResponse.json({ ok: true }))
        const res = await handler(req, ctx)
        await expect(res.json()).resolves.toEqual({ ok: true })
    })

    it('notuje kod błędu, gdy trasa zwraca 500', async () => {
        const handler = withCronHeartbeat('TC_SYNC_RUN', async () =>
            NextResponse.json({ ok: false, stage: 'download' }, { status: 500 }),
        )
        await handler(req, ctx)
        expect(entries()[1][2]).toMatchObject({ phase: 'done', status: 500 })
    })

    it('domyka heartbeat i przepuszcza wyjątek dalej', async () => {
        const handler = withCronHeartbeat('TC_SYNC_RUN', async () => {
            throw new Error('graph padł')
        })
        await expect(handler(req, ctx)).rejects.toThrow('graph padł')

        const calls = entries()
        expect(calls).toHaveLength(2)
        expect(calls[1][2]).toMatchObject({ phase: 'done', failed: true, error: 'graph padł' })
    })

    it('tnie zbyt duże statystyki zamiast zalewać audyt', async () => {
        const handler = withCronHeartbeat('TC_SYNC_RUN', async () =>
            NextResponse.json({ errors: Array.from({ length: 2000 }, () => 'x'.repeat(20)) }),
        )
        await handler(req, ctx)
        const done = entries()[1][2]
        expect(done.statsTruncated).toBe(true)
        expect(String(done.stats).length).toBeLessThanOrEqual(4000)
    })
})
