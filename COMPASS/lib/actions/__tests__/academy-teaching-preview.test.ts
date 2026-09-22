import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, courseRow, enrollmentRow, id, COURSE, OLD_VERSION, OTHER, USER, VERSION, versionRow } from './academy-fixtures'
import type { MockSupabase } from '@/test/mocks/supabase'
import { getCourseDetail } from '../courses'
import { listCourseQuestions, listTeachingQuestionVersions } from '../course-qa'
let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() }, logCompat: { error: vi.fn() } }))
beforeEach(() => { client = academyFixture() })

describe('instructor immutable-version preview', () => {
    it('uses the explicit permitted version without returning personal enrollment state or requesting answer keys', async () => {
        client = academyFixture({ tables: { course_enrollments: [enrollmentRow({ version_id: VERSION })] }, rpcs: { academy_can_manage_course: () => false, academy_can_preview_version: () => true, academy_get_syllabus: () => [], academy_quiz_question_count: () => 4 } })
        const result = await getCourseDetail(COURSE, { previewVersionId: OLD_VERSION })
        expect(result.success && result.data).toMatchObject({ version_id: OLD_VERSION, title: 'Zapisana wersja 1', enrollment_id: null, is_enrolled: false })
        expect(client.rpc).toHaveBeenCalledWith('academy_can_preview_version', { p_version_id: OLD_VERSION })
        expect(client.from).not.toHaveBeenCalledWith('course_quiz_options')
    })
    it('does not treat public metadata visibility as preview permission', async () => {
        client = academyFixture({ rpcs: { academy_can_preview_version: () => false } })
        expect((await getCourseDetail(COURSE, { previewVersionId: VERSION })).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_get_syllabus', expect.anything())
    })
    it('rejects an accessible version belonging to a different course', async () => {
        client = academyFixture({ tables: { courses: [courseRow()], course_versions: [versionRow({ course_id: id(11) })] } })
        expect((await getCourseDetail(COURSE, { previewVersionId: VERSION })).success).toBe(false)
    })
    it('lists questions from the instructor-selected version without requiring enrollment', async () => {
        client = academyFixture({ tables: { course_questions: [{ id: id(90), course_id: COURSE, version_id: OLD_VERSION, user_id: OTHER, question_text: 'Pytanie historyczne' }, { id: id(91), course_id: COURSE, version_id: VERSION, user_id: USER, question_text: 'Nowsze pytanie' }] } })
        const result = await listCourseQuestions(COURSE, undefined, undefined, OLD_VERSION)
        expect(result.success && result.data.map(question => question.id)).toEqual([id(90)])
    })
    it('gets version choices only from the scoped teaching RPC', async () => {
        client = academyFixture({ rpcs: { academy_teaching_versions: () => [{ id: OLD_VERSION, versionNumber: 1, title: 'Historyczna edycja', status: 'published' }] } })
        expect(await listTeachingQuestionVersions(COURSE)).toMatchObject({ success: true, data: [{ id: OLD_VERSION }] })
        expect(client.rpc).toHaveBeenCalledWith('academy_teaching_versions', { p_course_id: COURSE })
    })
})
