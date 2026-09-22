import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, COURSE, ENROLLMENT, id, USER, OTHER } from './academy-fixtures'
import type { MockSupabaseConfig } from '@/test/mocks/supabase'
const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
import { getMyAcademyCertificate, listAcademyCertificates, revokeAcademyCertificate } from '../academy-certificates'
const COMPLETION = id(90)
let client: ReturnType<typeof academyFixture>
function setup(config: MockSupabaseConfig = {}) { client = academyFixture(config); mocks.create.mockReturnValue(client) }
beforeEach(() => setup())
const completion = { id: COMPLETION, course_id: COURSE, enrollment_id: ENROLLMENT, user_id: USER, completed_at: '2026-09-22T10:00:00Z', revoked_at: null, revoked_reason: null, certificate_snapshot: { course_title: 'Program', participant_name: 'Uczeń', version_number: 1, certificate_hash: 'abc123' } }
const admin = { id: USER, role: 'admin', is_external: false, employment_status: 'active' }
describe('Academy certificate decisions', () => {
    it('rejects a trainer without administrator role before any revocation RPC', async () => {
        expect((await revokeAcademyCertificate(COMPLETION, 'Błędna obecność uczestnika')).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_revoke_completion', expect.anything())
    })
    it('requires an explicit meaningful reason', async () => {
        setup({ tables: { profiles: [admin] } })
        expect((await revokeAcademyCertificate(COMPLETION, '     ')).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_revoke_completion', expect.anything())
    })
    it('passes only completion identity and reason into the atomic decision', async () => {
        setup({ tables: { profiles: [admin] }, rpcs: { academy_revoke_completion: () => ({ already_revoked: false, rewards_state: 'manual_review', manual_reward_review_required: true }) } })
        const result = await revokeAcademyCertificate(COMPLETION, '  Błędna obecność uczestnika  ')
        expect(result).toEqual({ success: true, data: { already_revoked: false, rewards_state: 'manual_review', manual_reward_review_required: true } })
        expect(client.rpc).toHaveBeenCalledWith('academy_revoke_completion', { p_completion_id: COMPLETION, p_reason: 'Błędna obecność uczestnika' })
    })
    it('does not expose another participant certificate to a trainer with general course access', async () => {
        setup({ tables: { course_completions: [{ ...completion, user_id: OTHER }] } })
        expect((await getMyAcademyCertificate(COMPLETION)).success).toBe(false)
    })
    it('returns a current revoked state while preserving the exact historical snapshot', async () => {
        const row = { ...completion, revoked_at: '2026-09-22T11:00:00Z', revoked_reason: 'Błędny zapis obecności.' }
        setup({ tables: { course_completions: [row] } })
        expect(await getMyAcademyCertificate(COMPLETION)).toEqual({ success: true, data: row })
    })
    it('restricts the moderation catalogue to administrators', async () => {
        expect((await listAcademyCertificates()).success).toBe(false)
        expect(client.from).not.toHaveBeenCalledWith('course_completions')
    })
    it('includes the audit and reward resolution with an administrator record', async () => {
        const decision = { completion_id: COMPLETION, rewards_state: 'retained_valid_completion', reversed_transactions: 0, manual_reward_review_required: false }
        setup({ tables: { profiles: [admin], course_completions: [completion], academy_completion_revocations: [decision] } })
        const result = await listAcademyCertificates()
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.items[0].decision).toEqual(decision)
    })
})
