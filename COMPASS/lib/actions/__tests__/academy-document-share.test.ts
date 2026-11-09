import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: vi.fn() }))

import { requireAcademyContext } from '@/lib/academy/server'
import { getCertificateShare, setCertificateShare } from '../academy-document-share'

const id = '11111111-1111-4111-8111-111111111111'
const rpc = vi.fn()
const responses: Record<string, { data: unknown; error: unknown }> = {}
const client = {
    rpc,
    auth: { getUser: async () => ({ data: { user: { email: 'owner@example.test' } } }) },
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => responses[table] }) }) }),
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.mocked(requireAcademyContext).mockResolvedValue({ client, access: { userId: 'u1' } } as never)
    responses.academy_learner_accounts = { data: null, error: null }
    responses.academy_document_shares = { data: null, error: null }
})

describe('setCertificateShare', () => {
    it('refuses without Academy access and does not call the database', async () => {
        vi.mocked(requireAcademyContext).mockRejectedValue(new Error('Nie masz dostępu do Akademii.'))
        await expect(setCertificateShare(id, true)).resolves.toEqual({ success: false, error: 'Nie masz dostępu do Akademii.' })
        expect(rpc).not.toHaveBeenCalled()
    })

    it('refuses somebody else’s document with a plain message', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'own_document_required' } })
        await expect(setCertificateShare(id, true)).resolves.toEqual({ success: false, error: 'Nie możesz udostępnić tego dokumentu.' })
    })

    it('rejects a malformed identifier', async () => {
        expect((await setCertificateShare('x', true)).success).toBe(false)
        expect(rpc).not.toHaveBeenCalled()
    })

    it('passes the owner decision and returns the code', async () => {
        rpc.mockResolvedValue({ data: { public_code: 'c'.repeat(32), share_enabled: true }, error: null })
        await expect(setCertificateShare(id, true)).resolves.toEqual({ success: true, data: { enabled: true, code: 'c'.repeat(32) } })
        expect(rpc).toHaveBeenCalledWith('academy_set_document_share', { p_kind: 'certificate', p_document_id: id, p_enabled: true })
    })

    it('says the migration is pending', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        const result = await setCertificateShare(id, true)
        expect(!result.success && result.error).toContain('czeka na migrację')
    })
})

describe('getCertificateShare', () => {
    it('is unavailable while the switch is off for a regular account', async () => {
        await expect(getCertificateShare(id)).resolves.toEqual({ success: true, data: { available: false, migrated: true, enabled: false, code: null } })
    })

    it('is available for a trial account on the owner mailbox list', async () => {
        vi.stubEnv('ACADEMY_MAIL_TEST_RECIPIENTS', 'owner@example.test')
        responses.academy_learner_accounts = { data: { source: 'proba' }, error: null }
        const result = await getCertificateShare(id)
        expect(result.success && result.data.available).toBe(true)
    })

    it('is available to everyone when the owner turns the switch on', async () => {
        vi.stubEnv('ACADEMY_PUBLIC_VERIFY_ENABLED', 'true')
        responses.academy_document_shares = { data: { public_code: 'c'.repeat(32), share_enabled: true }, error: null }
        await expect(getCertificateShare(id)).resolves.toEqual({ success: true, data: { available: true, migrated: true, enabled: true, code: 'c'.repeat(32) } })
    })

    it('reports a pending migration instead of an error', async () => {
        responses.academy_document_shares = { data: null, error: { code: '42P01', message: 'x' } }
        const result = await getCertificateShare(id)
        expect(result.success && result.data.migrated).toBe(false)
    })
})
