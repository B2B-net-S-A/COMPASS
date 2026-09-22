import { beforeEach, expect, it, vi } from 'vitest'
import { getLearningPathDetail, listLearningPaths, checkLearningPathCompletion, enrollInLearningPath } from '../learning-paths'
import { academyFixture, courseRow, versionRow, id, USER, COURSE, VERSION, OLD_VERSION, enrollmentRow, ENROLLMENT, RUN } from './academy-fixtures'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'
let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
const PATH = id(100), B = id(11), C = id(12)
function setup(config: MockSupabaseConfig = {}) {
    client = academyFixture({ ...config, tables: { learning_paths: [{ id: PATH, slug: 'sciezka', title: 'Ścieżka', status: 'published' }], learning_path_courses: [{ path_id: PATH, course_id: COURSE, order_index: 0, is_required: true }, { path_id: PATH, course_id: C, order_index: 1, is_required: true }], learning_path_enrollments: [{ user_id: USER, path_id: PATH, completed_at: null, required_course_ids: [COURSE, B] }], courses: [courseRow(), courseRow({ id: B, title: 'Wymagany przy zapisie' }), courseRow({ id: C, title: 'Dodany później' })], course_completions: [{ user_id: USER, course_id: COURSE }], ...config.tables }, rpcs: { academy_enrollment_has_access: () => true, ...config.rpcs } })
}
beforeEach(() => setup())
it('uses saved requirements rather than a later change to the path', async () => {
    const result = await getLearningPathDetail('sciezka')
    expect(result.success && result.data.courses.map(row => row.course_id)).toEqual([COURSE, B])
    expect(result.success && result.data).toMatchObject({ total_courses_count: 2, completed_courses_count: 1, progress_percent: 50 })
    const list = await listLearningPaths()
    expect(list.success && list.data[0]).toMatchObject({ course_count: 2, progress_percent: 50 })
})
it('keeps unavailable required courses visible in the denominator', async () => {
    setup({ tables: { courses: [courseRow()] } })
    const result = await getLearningPathDetail('sciezka')
    expect(result.success && result.data.courses[1]).toMatchObject({ course_id: B, course: null, is_completed: false })
    expect(result.success && result.data.total_courses_count).toBe(2)
})
it('uses trusted completion evidence and does not make optional courses a requirement', async () => {
    setup({ tables: { learning_path_courses: [{ path_id: PATH, course_id: C, order_index: 0, is_required: false }], course_enrollments: [enrollmentRow({ completed_at: '2026-09-22' })], course_completions: [] } })
    const result = await getLearningPathDetail('sciezka')
    expect(result.success && result.data).toMatchObject({ total_courses_count: 2, completed_courses_count: 0, progress_percent: 0 })
    expect(result.success && result.data.courses).toHaveLength(3)
})
it('retains the selected run and version for Continue links', async () => {
    setup({ tables: { course_enrollments: [enrollmentRow({ run_id: RUN })], course_versions: [versionRow({ id: OLD_VERSION, metadata: { title: 'Utrwalona wersja kursu' } })] } })
    const result = await getLearningPathDetail('sciezka')
    expect(result.success && result.data.courses[0]).toMatchObject({ enrollment_id: ENROLLMENT, run_id: RUN, course: { title: 'Utrwalona wersja kursu', version_id: OLD_VERSION } })
})
it('does not resume a withdrawn registration or select a foreign enrollment', async () => {
    setup({ tables: { course_enrollments: [enrollmentRow({ run_id: RUN }), enrollmentRow({ id: id(31), user_id: id(99), version_id: VERSION })] }, rpcs: { academy_enrollment_has_access: () => false } })
    const result = await getLearningPathDetail('sciezka')
    expect(result.success && result.data.courses[0]).toMatchObject({ is_enrolled: false, enrollment_id: null, run_id: null })
})
it('uses current curriculum before enrollment and rejects unauthenticated reads', async () => {
    setup({ tables: { learning_path_enrollments: [] } })
    const result = await getLearningPathDetail('sciezka')
    expect(result.success && result.data.courses.map(row => row.course_id)).toEqual([COURSE, C])
    setup({ user: null }); expect((await listLearningPaths()).success).toBe(false)
})
it('enrolls and finalizes only through the authenticated atomic path RPCs', async () => {
    setup({ rpcs: { academy_enroll_path: () => id(200), academy_complete_path: () => ({ now_completed: true, completed: true }) } })
    expect(await enrollInLearningPath(PATH)).toEqual({ success: true, data: { enrollmentId: id(200) } })
    expect(await checkLearningPathCompletion(PATH)).toEqual({ success: true, data: { now_completed: true, completed: true } })
    expect(client.rpc).toHaveBeenCalledWith('academy_complete_path', { p_path_id: PATH })
})
