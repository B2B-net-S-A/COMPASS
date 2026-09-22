import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, courseRow, id, COURSE, DRAFT, OTHER, RUN, USER, VERSION } from './academy-fixtures'
import type { MockSupabase } from '@/test/mocks/supabase'
import { getAcademyStaff, setAcademyStaff } from '../academy-staff'
import { getMyCourses, listPublishedCourses, updateCourse } from '../courses'
import { reviewLegacyCourse } from '../courses-admin'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => { client = academyFixture() })

describe('academy staff boundaries', () => {
    it('does not request the private staff directory for a non-owner editor', async () => {
        client = academyFixture({ rpcs: { academy_can_assign_staff: () => false } })
        expect(await getAcademyStaff(COURSE)).toEqual({ success: true, data: null })
        expect(client.rpc).not.toHaveBeenCalledWith('academy_get_staff', expect.anything())
    })
    it('does not permit a run editor role and preserves database rejection', async () => {
        expect((await setAcademyStaff({ courseId: COURSE, runId: RUN, userId: OTHER, role: 'editor', enabled: true })).success).toBe(false)
        expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['academy_rollout_access'])
        client = academyFixture({ rpcs: { academy_set_course_staff: () => { throw new Error('course_owner_or_admin_required') } } })
        expect(await setAcademyStaff({ courseId: COURSE, userId: OTHER, role: 'editor', enabled: true })).toEqual({ success: false, error: 'Przypisaniami zarządza autor szkolenia lub administrator.' })
    })
    it('uses the scoped run assignment RPC for removal', async () => {
        client = academyFixture({ rpcs: { academy_set_run_staff: () => null } })
        expect((await setAcademyStaff({ courseId: COURSE, runId: RUN, userId: OTHER, role: 'facilitator', enabled: false })).success).toBe(true)
        expect(client.rpc).toHaveBeenCalledWith('academy_set_run_staff', { p_run_id: RUN, p_user_id: OTHER, p_enabled: false })
    })
    it('resolves an assigned facilitator to the published program rather than draft metadata', async () => {
        client = academyFixture({ rpcs: { academy_teaching_courses: () => [courseRow({ author_id: OTHER, can_edit: false, can_lead: true })] } })
        const result = await getMyCourses()
        expect(result.success && result.data[0]).toMatchObject({ version_id: VERSION, title: 'Program wersji 2', can_edit: false })
    })
    it('resolves assigned editors to a draft without filtering them out by author', async () => {
        client = academyFixture({ rpcs: { academy_teaching_courses: () => [courseRow({ author_id: OTHER, can_edit: true, can_lead: false })] } })
        const result = await getMyCourses()
        expect(result.success && result.data[0]).toMatchObject({ version_id: DRAFT, title: 'Roboczy program', can_lead: false })
    })
    it('filters public instructor courses and excludes held legacy publications', async () => {
        client = academyFixture({ tables: { courses: [courseRow(), courseRow({ id: id(11), legacy_review_required: true }), courseRow({ id: id(12) })] }, rpcs: { academy_catalog_instructors: () => [{ id: OTHER, name: 'Prowadzący', courseIds: [COURSE, id(11)] }] } })
        const result = await listPublishedCourses({ instructor_id: OTHER })
        expect(result.success && result.data.items.map(item => item.id)).toEqual([COURSE])
    })
    it('passes unique prerequisite IDs and rejects duplicates before an update', async () => {
        client = academyFixture({ rpcs: { academy_update_course: () => null } })
        expect((await updateCourse(COURSE, { prerequisite_course_ids: [id(11)] })).success).toBe(true)
        expect(client.rpc).toHaveBeenCalledWith('academy_update_course', { p_course_id: COURSE, p_patch: { prerequisite_course_ids: [id(11)] } })
        client.rpc.mockClear()
        expect((await updateCourse(COURSE, { prerequisite_course_ids: [id(11), id(11)] })).success).toBe(false)
        expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['academy_rollout_access'])
    })
    it('binds legacy acceptance to the displayed immutable version and never awards a new bonus', async () => {
        client = academyFixture({ tables: { profiles: [{ id: USER, role: 'admin' }] }, rpcs: { academy_review_legacy_course: () => null } })
        expect(await reviewLegacyCourse(COURSE, VERSION, true)).toEqual({ success: true, data: { firstPublishBonus: false } })
        expect(client.rpc).toHaveBeenCalledWith('academy_review_legacy_course', { p_course_id: COURSE, p_version_id: VERSION, p_approve: true, p_reason: null })
    })
})
