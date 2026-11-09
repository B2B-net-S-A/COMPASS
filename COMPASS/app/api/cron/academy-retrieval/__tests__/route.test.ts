import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, holdAcademyMail } = vi.hoisted(() => ({ rpc: vi.fn(), holdAcademyMail: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/with-auth', () => ({ withCronAuth: (handler: (req: NextRequest, ctx: unknown) => unknown) => (req: NextRequest) => handler(req, { admin: { rpc } }) }))
vi.mock('@/lib/audit/cron-heartbeat', () => ({ withCronHeartbeat: (_action: string, handler: unknown) => handler }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/academy/outbound', () => ({ holdAcademyMail }))
vi.mock('@/lib/email', () => ({ buildRetrievalDueEmail: () => ({ subject: 'Temat', html: '<p>Treść</p>' }) }))

import { GET } from '../route'

const due = { schedule_id: 's1', recipient: 'a@example.test', full_name: 'A', course_title: 'PEGA', offset_days: 14, due_at: '2027-06-20T10:00:00Z' }
const call = async () => { const response = await (GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest('http://local/api')); return { status: response.status, body: await response.json() } }
const rpcs = (dueRows: unknown, markError: unknown = null) => rpc.mockImplementation(async (name: string) => name === 'academy_retrieval_due' ? { data: dueRows, error: null } : { data: true, error: markError })

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ACADEMY_RETRIEVAL_ENABLED', 'true'); holdAcademyMail.mockResolvedValue({ status: 'held', id: 'x' }) })
afterEach(() => vi.unstubAllEnvs())

describe('academy-retrieval', () => {
    it('does nothing at all while the switch is off', async () => {
        vi.stubEnv('ACADEMY_RETRIEVAL_ENABLED', 'false')
        expect((await call()).body).toMatchObject({ ok: true, skipped: 'switch_off' })
        expect(rpc).not.toHaveBeenCalled()
        expect(holdAcademyMail).not.toHaveBeenCalled()
    })

    it('holds the mail, then rings the bell, and sends nothing', async () => {
        rpcs([due])
        expect((await call()).body).toMatchObject({ ok: true, sent: 0, held: 1, notified: 1 })
        expect(holdAcademyMail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'retrieval_due', dedupeKey: 'retrieval:s1' }))
        expect(rpc).toHaveBeenCalledWith('academy_retrieval_mark_notified', { p_schedule_id: 's1' })
    })

    it('rings the bell for a message already in the queue', async () => {
        rpcs([due])
        holdAcademyMail.mockResolvedValue({ status: 'duplicate' })
        expect((await call()).body).toMatchObject({ ok: true, duplicate: 1, notified: 1 })
    })

    it('does not ring the bell when the queue refuses, so the retry can still send it', async () => {
        rpcs([due, { ...due, schedule_id: 's2' }])
        holdAcademyMail.mockResolvedValue({ status: 'refused', reason: 'write_failed' })
        const { status, body } = await call()
        expect(status).toBe(500)
        expect(body).toMatchObject({ failed: 1, notified: 0 })
        expect(rpc).not.toHaveBeenCalledWith('academy_retrieval_mark_notified', expect.anything())
        expect(holdAcademyMail).toHaveBeenCalledTimes(1)
    })

    it('is green and idle before the migration', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        expect((await call()).body).toMatchObject({ ok: true, migration_pending: true })
    })

    it('is red when the read fails', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
        expect((await call()).status).toBe(500)
    })

    it('reports a failed bell without losing the rest', async () => {
        rpcs([due], { code: '57014', message: 'timeout' })
        const { status, body } = await call()
        expect(status).toBe(500)
        expect(body).toMatchObject({ held: 1, notified: 0, failed: 1 })
    })
})
