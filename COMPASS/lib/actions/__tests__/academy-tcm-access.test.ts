import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockSupabase } from '@/test/mocks/supabase'
import { academyFixture, COURSE, USER, VERSION, id } from './academy-fixtures'
import { requireAcademyContext } from '@/lib/academy/server'
import { approveCourse, canReviewCourseVersion, getReviewQueue } from '../courses-admin'
import { setAcademyRollout, setAcademyTrainer, listAcademyTrainerPage } from '../academy-access'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
const profile = { id: USER, role: 'talent_community', is_external: false, employment_status: 'active' }
beforeEach(() => {
    client = academyFixture({ tables: { profiles: [profile], academy_user_capabilities: [] }, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'closed', isPilot: false }) } })
})

describe('TCM Academy editor authorization', () => {
    it('uses role-based editing without a trainer grant or administrator identity', async () => {
        const { access } = await requireAcademyContext({ trainer: true, editor: true })
        expect(access).toMatchObject({ userId: USER, isAdmin: false, canTeach: true, canManageAcademy: true, rolloutMode: 'closed', isPilot: false })
        expect(client.from).not.toHaveBeenCalledWith('academy_user_capabilities')
    })
    it.each([
        () => setAcademyTrainer(id(2), true),
        () => setAcademyRollout({ mode: 'closed', userIds: [] }),
    ])('denies administrator writes before their RPC', async action => {
        expect(await action()).toEqual({ success: false, error: 'Ta operacja wymaga uprawnień administratora.' })
        expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['academy_rollout_access'])
    })
    const reviewerProbe = (probe: () => unknown) => academyFixture({ tables: { profiles: [profile], academy_user_capabilities: [], course_versions: [] }, rpcs: {
        academy_rollout_access: () => ({ allowed: true, mode: 'closed', isPilot: false }),
        academy_is_reviewer: probe,
        academy_review_course: () => ({ first_publish_bonus: false }),
        academy_can_review_version: () => true,
    } })
    it('opens the review queue and decision to a TCM once the B3.10 migration confirms the reviewer', async () => {
        client = reviewerProbe(() => true)
        const { access } = await requireAcademyContext({ reviewer: true })
        expect(access).toMatchObject({ isAdmin: false, canReview: true })
        expect(await canReviewCourseVersion(VERSION)).toEqual({ success: true, data: true })
        expect((await getReviewQueue()).success).toBe(true)
    })
    it('keeps the old behaviour for a TCM until the migration exists', async () => {
        client = academyFixture({ tables: { profiles: [profile], academy_user_capabilities: [] }, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'closed', isPilot: false }) } })
        client.rpc.mockImplementationOnce(async () => ({ data: { allowed: true, mode: 'closed', isPilot: false }, error: null }))
        client.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'missing', code: 'PGRST202' } }))
        expect(await approveCourse(COURSE, VERSION, id(90))).toEqual({ success: false, error: 'Ta operacja wymaga uprawnień recenzenta Akademii.' })
        expect(client.rpc).not.toHaveBeenCalledWith('academy_review_course', expect.anything())
    })
    it('does not ask the database about review for callers that do not need it', async () => {
        client = reviewerProbe(() => true)
        const { access } = await requireAcademyContext({ editor: true })
        expect(access.canReview).toBeUndefined()
        expect(client.rpc).not.toHaveBeenCalledWith('academy_is_reviewer')
    })
    it('denies the review actions to an ordinary role without the probe', async () => {
        client = academyFixture({ tables: { profiles: [{ ...profile, role: 'consultant' }], academy_user_capabilities: [] }, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'open', isPilot: false }) } })
        expect(await approveCourse(COURSE, VERSION, id(90))).toEqual({ success: false, error: 'Ta operacja wymaga uprawnień recenzenta Akademii.' })
        expect(client.rpc).not.toHaveBeenCalledWith('academy_is_reviewer')
    })
    it('never treats a learner account as a reviewer', async () => {
        const learner = { id: USER, email: 'u@example.test', app_metadata: { academy_only: true } }
        client = academyFixture({ tables: { profiles: [profile] }, user: learner, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'pilot', isPilot: true }), academy_is_reviewer: () => true } })
        await expect(requireAcademyContext({ reviewer: true })).rejects.toThrow('recenzenta Akademii')
        expect(client.rpc).not.toHaveBeenCalledWith('academy_is_reviewer')
    })
    it('does not grant a consultant trainer global editing', async () => {
        client = academyFixture()
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('uprawnień obsługi Akademii')
    })
    it.each([{ is_external: true }, { employment_status: 'exited' }, { role: 'nieznana' }])('denies ineligible profiles %j', async patch => {
        client = academyFixture({ tables: { profiles: [{ ...profile, ...patch }] } })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('Nie masz dostępu do Akademii')
        expect(client.rpc).not.toHaveBeenCalled()
    })
    it.each(['internal', 'manager', 'finanse'])('leaves the %s decision to the rollout', async role => {
        client = academyFixture({ tables: { profiles: [{ ...profile, role }] }, rpcs: { academy_rollout_access: () => ({ allowed: false, mode: 'closed' }) } })
        await expect(requireAcademyContext()).rejects.toThrow('nie jest jeszcze dostępna')
    })
    it.each(['internal', 'manager', 'finanse'])('admits a %s from the pilot as a learner, never as an editor', async role => {
        client = academyFixture({ tables: { profiles: [{ ...profile, role }], academy_user_capabilities: [] }, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'pilot', isPilot: true }) } })
        const { access } = await requireAcademyContext()
        expect(access).toMatchObject({ isAdmin: false, canManageAcademy: false, canTeach: false, isPilot: true })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('uprawnień obsługi Akademii')
    })
    it('keeps a learner account a learner even with a trainer grant or a stray role', async () => {
        const learner = { id: USER, email: 'u@example.test', app_metadata: { academy_only: true } }
        client = academyFixture({ tables: { profiles: [{ ...profile, role: 'consultant' }], academy_user_capabilities: [{ user_id: USER, can_train: true, revoked_at: null }] }, user: learner, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'pilot', isPilot: true }) } })
        const { access } = await requireAcademyContext()
        expect(access).toMatchObject({ isAdmin: false, canManageAcademy: false, canTeach: false })
        await expect(requireAcademyContext({ trainer: true })).rejects.toThrow('uprawnionych trenerów')
        client = academyFixture({ tables: { profiles: [{ ...profile, role: 'admin' }] }, user: learner, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'pilot', isPilot: true }) } })
        await expect(requireAcademyContext({ admin: true })).rejects.toThrow('uprawnień administratora')
    })
    it('fails closed when the rollout authority denies access', async () => {
        client = academyFixture({ tables: { profiles: [profile] }, rpcs: { academy_rollout_access: () => ({ allowed: false, mode: 'closed' }) } })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('nie jest jeszcze dostępna')
    })
    it('fails closed when the rollout check fails', async () => {
        client = academyFixture({ tables: { profiles: [profile] }, rpcs: { academy_rollout_access: () => { throw new Error('unavailable') } } })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('sprawdzić dostępności')
    })
    it('requires an authenticated user', async () => {
        client = academyFixture({ user: null })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('Zaloguj się')
    })
    it('shows TCM as an automatic editor in the administrator trainer directory', async () => {
        client = academyFixture({ tables: { profiles: [{ ...profile, full_name: 'TCM', email: 'tcm@example.test' }, { id: id(2), role: 'admin', is_external: false, employment_status: 'active', full_name: 'Admin', email: 'admin@example.test' }], academy_user_capabilities: [] }, user: { id: id(2), email: 'admin@example.test' } })
        const result = await listAcademyTrainerPage({ search: 'tcm' })
        expect(result.success && result.data.items).toEqual([expect.objectContaining({ id: USER, role: 'talent_community', canTeach: true, grantedAt: null })])
        expect(client.from).not.toHaveBeenCalledWith('academy_user_capabilities')
    })
})
