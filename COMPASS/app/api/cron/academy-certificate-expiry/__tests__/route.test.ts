import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, holdAcademyMail } = vi.hoisted(() => ({ rpc: vi.fn(), holdAcademyMail: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/with-auth', () => ({ withCronAuth: (handler: (req: NextRequest, ctx: unknown) => unknown) => (req: NextRequest) => handler(req, { admin: { rpc } }) }))
vi.mock('@/lib/audit/cron-heartbeat', () => ({ withCronHeartbeat: (_action: string, handler: unknown) => handler }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/academy/outbound', () => ({ holdAcademyMail }))
vi.mock('@/lib/email', () => ({ buildCertificateExpiryEmail: () => ({ subject: 'Temat', html: '<p>Treść</p>' }) }))

import { GET } from '../route'

const row = { completion_id: 'c1', recipient: 'a@example.test', full_name: 'A', course_title: 'DORA', course_slug: 'dora', valid_until: '2027-06-20T10:00:00Z' }
const call = async () => { const response = await (GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest('http://local/api')); return { status: response.status, body: await response.json() } }

beforeEach(() => { vi.clearAllMocks(); holdAcademyMail.mockResolvedValue({ status: 'held', id: 'x' }) })

describe('academy-certificate-expiry', () => {
    it('only holds the reminder, one per document, expiring with the certificate', async () => {
        rpc.mockResolvedValue({ data: [row], error: null })
        const { status, body } = await call()
        expect(status).toBe(200)
        expect(body).toMatchObject({ ok: true, sent: 0, held: 1 })
        expect(rpc).toHaveBeenCalledWith('academy_certificates_expiring', { p_within_days: 30 })
        expect(holdAcademyMail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'certificate_expiry', expiresAt: row.valid_until, dedupeKey: 'certificate_expiry:c1' }))
    })

    it('does nothing and stays green before the migration', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } })
        expect((await call()).body).toMatchObject({ ok: true, migration_pending: true, held: 0 })
        expect(holdAcademyMail).not.toHaveBeenCalled()
    })

    it('is red on a read failure instead of reporting nothing to remind', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
        expect((await call()).status).toBe(500)
    })

    it('counts a repeat as a duplicate, not a failure', async () => {
        rpc.mockResolvedValue({ data: [row], error: null })
        holdAcademyMail.mockResolvedValue({ status: 'duplicate' })
        expect((await call()).body).toMatchObject({ ok: true, held: 0, duplicate: 1 })
    })

    it('stops at an unavailable queue and reports failure', async () => {
        rpc.mockResolvedValue({ data: [row, { ...row, completion_id: 'c2' }], error: null })
        holdAcademyMail.mockResolvedValue({ status: 'refused', reason: 'migration_pending' })
        const { status, body } = await call()
        expect(status).toBe(500)
        expect(body.failed).toBe(1)
        expect(holdAcademyMail).toHaveBeenCalledTimes(1)
    })
})
