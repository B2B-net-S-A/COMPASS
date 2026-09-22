import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminLmsAnalytics, getAuthorAnalytics } from '../courses-analytics'
import { getAcademyAccess, getAcademyRollout, setAcademyRollout } from '../academy-access'
import { academyFixture, courseRow, enrollmentRow, versionRow, USER, COURSE, DRAFT, ENROLLMENT, RUN, id } from './academy-fixtures'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
function setup(config: MockSupabaseConfig = {}, admin = true) {
    client = academyFixture({ ...config, tables: { profiles: [{ id: USER, role: admin ? 'admin' : 'consultant', is_external: false, employment_status: 'active' }], ...config.tables } })
}
beforeEach(() => setup())

describe('Academy rollout actions', () => {
    it('fails closed when the policy RPC fails or denies access', async () => {
        setup({ rpcs: { academy_rollout_access: () => { throw new Error('offline') } } })
        expect((await getAcademyAccess()).success).toBe(false)
        setup({ rpcs: { academy_rollout_access: () => ({ mode: 'closed', allowed: false, isPilot: false }) } }, false)
        expect((await getAuthorAnalytics()).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_teaching_courses')
    })
    it('exposes the server policy state for a pilot participant', async () => {
        setup({ rpcs: { academy_rollout_access: () => ({ mode: 'pilot', allowed: true, isPilot: true }) } }, false)
        expect(await getAcademyAccess()).toMatchObject({ success: true, data: { userId: USER, rolloutMode: 'pilot', isPilot: true } })
    })
    it.each(['manager', 'internal', 'finanse', 'talent_community'])('does not extend Academy to %s', async role => {
        setup({ tables: { profiles: [{ id: USER, role, is_external: false, employment_status: 'active' }] } })
        expect((await getAcademyAccess()).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalled()
    })
    it('requires an administrator to inspect or change rollout settings', async () => {
        setup({}, false)
        expect((await getAcademyRollout()).success).toBe(false)
        expect((await setAcademyRollout({ mode: 'open', userIds: [] })).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_set_rollout', expect.anything())
    })
    it('persists only validated deduplicated IDs through the policy RPC', async () => {
        setup({ rpcs: { academy_set_rollout: () => null } })
        expect(await setAcademyRollout({ mode: 'pilot', userIds: [USER, USER] })).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith('academy_set_rollout', { p_mode: 'pilot', p_user_ids: [USER] })
        client.rpc.mockClear()
        expect((await setAcademyRollout({ mode: 'pilot', userIds: ['not-a-uuid'] })).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_set_rollout', expect.anything())
    })
})

describe('version-aware Academy reporting', () => {
    it('counts published pointers and pending versions independently, retaining archived completions', async () => {
        setup({ tables: {
            courses: [courseRow({ status: 'pending_review' }), courseRow({ id: id(11), status: 'archived', published_version_id: id(23) })],
            course_versions: [versionRow(), versionRow({ id: DRAFT, status: 'pending_review' }), versionRow({ id: id(23), course_id: id(11) })],
            course_enrollments: [enrollmentRow(), enrollmentRow({ id: id(32), course_id: id(11) })],
            course_completions: [{ id: id(90), course_id: id(11), enrollment_id: id(32) }],
        } })
        const result = await getAdminLmsAnalytics()
        expect(result).toMatchObject({ success: true, data: { total_published_courses: 1, total_pending_review: 1, total_enrollments: 2, total_completions: 1, overall_completion_rate: 50 } })
        expect(result.success && result.data.monthly_enrollments).toHaveLength(12)
    })
    it('excludes waitlisted, canceled and revoked completions; ignores untrusted completed_at', async () => {
        setup({ tables: {
            course_enrollments: [enrollmentRow({ completed_at: '2026-09-22' }), ...[31, 32, 33].map(n => enrollmentRow({ id: id(n), run_id: RUN }))],
            course_runs: [{ id: RUN, status: 'published' }],
            course_run_registrations: [{ id: id(51), enrollment_id: id(31), status: 'confirmed' }, { id: id(52), enrollment_id: id(32), status: 'waitlisted' }, { id: id(53), enrollment_id: id(33), status: 'cancelled' }],
            course_completions: [{ id: id(90), course_id: COURSE, enrollment_id: id(31) }, { id: id(91), course_id: COURSE, enrollment_id: ENROLLMENT, revoked_at: '2026-09-22' }],
        } })
        expect(await getAdminLmsAnalytics()).toMatchObject({ success: true, data: { total_enrollments: 2, total_completions: 1 } })
    })
    it('reads past the first response page without losing enrollments', async () => {
        setup({ tables: { course_enrollments: Array.from({ length: 1002 }, (_, index) => enrollmentRow({ id: id(index + 1000) })) } })
        expect(await getAdminLmsAnalytics()).toMatchObject({ success: true, data: { total_enrollments: 1002 } })
    })
    it('fails the report on a failed query instead of presenting zeros', async () => {
        const original = client.from.getMockImplementation()!
        client.from.mockImplementation((table: string) => { if (table === 'course_completions') throw new Error('query failed'); return original(table) })
        expect((await getAdminLmsAnalytics()).success).toBe(false)
        expect(client.from).toHaveBeenCalledWith('course_completions')
    })
    it('requires a trainer grant and limits returned courses to monitored assignments', async () => {
        setup({ tables: { academy_user_capabilities: [] } }, false)
        expect((await getAuthorAnalytics()).success).toBe(false)
        setup({ tables: { course_enrollments: [enrollmentRow(), enrollmentRow({ id: id(32), course_id: id(11) })] }, rpcs: { academy_teaching_courses: () => [courseRow({ can_lead: true }), courseRow({ id: id(11), can_edit: true, can_lead: false, can_manage_assigned_runs: false })] } }, false)
        const result = await getAuthorAnalytics()
        expect(result).toMatchObject({ success: true, data: { total_courses: 1, total_enrollments: 1 } })
        expect(result.success && result.data.courses.map(course => course.course_id)).toEqual([COURSE])
    })
})
