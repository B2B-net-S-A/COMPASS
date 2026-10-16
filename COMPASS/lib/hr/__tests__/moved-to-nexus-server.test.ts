import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const logSystemAudit = vi.fn()
vi.mock('@/lib/audit/system-log', () => ({ logSystemAudit: (...args: unknown[]) => logSystemAudit(...args) }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { MOVED_TO_NEXUS_REASON, movedExportResponse, skipWhenMovedToNexus } from '@/lib/hr/moved-to-nexus-server'

const request = () => new NextRequest('https://compass.test/api/cron/oof-reconcile')
const ctx = { admin: {} as never }

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('skipWhenMovedToNexus', () => {
    it('runs the cron as before while the module is not moved', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'time')
        const handler = vi.fn(async () => Response.json({ ok: true, scanned: 3 }))
        const response = await skipWhenMovedToNexus('leave', handler, { heartbeat: 'FORWARD_RECONCILE_RUN' })(request(), ctx)
        expect(handler).toHaveBeenCalledTimes(1)
        expect(await response.json()).toEqual({ ok: true, scanned: 3 })
        expect(logSystemAudit).not.toHaveBeenCalled()
    })

    it('skips the work of a moved module and leaves a heartbeat with the reason', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave')
        const handler = vi.fn()
        const response = await skipWhenMovedToNexus('leave', handler, { heartbeat: 'FORWARD_RECONCILE_RUN' })(request(), ctx)
        expect(handler).not.toHaveBeenCalled()
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true, skipped: true, module: 'leave', reason: MOVED_TO_NEXUS_REASON })
        expect(logSystemAudit).toHaveBeenCalledWith(null, 'FORWARD_RECONCILE_RUN', expect.objectContaining({
            phase: 'done', skipped: true, module: 'leave', reason: 'przeniesione do NEXUSA',
        }))
    })

    it('leaves the heartbeat to withCronHeartbeat when no action is given', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'care')
        const response = await skipWhenMovedToNexus('care', vi.fn())(request(), ctx)
        expect((await response.json()).skipped).toBe(true)
        expect(logSystemAudit).not.toHaveBeenCalled()
    })
})

describe('movedExportResponse', () => {
    it('keeps the export running when the module is only read-only', () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave')
        vi.stubEnv('HR_EXPORTS_OFF', '')
        expect(movedExportResponse('leave')).toBeNull()
    })

    it('answers 410 with an explicit code, never an empty list', async () => {
        vi.stubEnv('HR_EXPORTS_OFF', 'care')
        const response = movedExportResponse('care')
        expect(response?.status).toBe(410)
        expect(response?.headers.get('cache-control')).toContain('no-store')
        const body = await response!.json()
        expect(body).toMatchObject({ error: 'moved_to_nexus', module: 'care' })
        expect(body).not.toHaveProperty('people')
        expect(body).not.toHaveProperty('signals')
    })
})
