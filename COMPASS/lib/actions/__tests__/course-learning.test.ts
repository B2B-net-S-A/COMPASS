import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'
import { academyFixture, courseRow, enrollmentRow, id, ATTEMPT, COURSE, ENROLLMENT, LESSON, OLD_VERSION, OPTION, OTHER, QUESTION, RUN, RUN_ENROLLMENT, USER, VERSION } from './academy-fixtures'
import { completeAcademyCourse, enrollInCourse, getMyEnrollmentsPage, getMyQuizResult, getQuizForAttempt, markLessonComplete, recordLessonAccess, submitQuizAttempt, submitRating } from '../course-learning'
import { quizAttemptWindowMessage } from '@/lib/academy/quiz-attempt-policy'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() }, logCompat: { error: vi.fn() } }))
function setup(config: MockSupabaseConfig = {}) {
    client = academyFixture({ ...config, tables: { academy_user_capabilities: [], ...config.tables }, rpcs: {
        academy_get_syllabus: ({ p_version_id }) => (config.tables?.course_lessons ?? []).filter(row => row.version_id === p_version_id),
        academy_my_enrollments_page: ({ p_active_page, p_completed_page, p_revoked_page, p_limit }) => {
            const completions = new Map((client._tables.course_completions ?? []).map(row => [row.enrollment_id, row]))
            const runs = new Map((client._tables.course_runs ?? []).map(row => [row.id, row]))
            const registrations = client._tables.course_run_registrations ?? []
            const eligible = (client._tables.course_enrollments ?? []).filter(row => row.user_id === USER && (!row.run_id || row.completed_at || registrations.some(registration => registration.enrollment_id === row.id && registration.user_id === USER && registration.status === 'confirmed' && runs.get(registration.run_id)?.status === 'published')))
            const sectionOf = (row: Record<string, unknown>) => completions.get(row.id)?.revoked_at ? 'revoked' : row.completed_at ? 'completed' : 'active'
            const totals = { active: 0, completed: 0, revoked: 0 }
            for (const row of eligible) totals[sectionOf(row) as keyof typeof totals]++
            const pageFor = (section: keyof typeof totals, page: number) => eligible.filter(row => sectionOf(row) === section)
                .sort((a, b) => String(b.last_accessed_at ?? b.enrolled_at).localeCompare(String(a.last_accessed_at ?? a.enrolled_at)) || String(b.id).localeCompare(String(a.id)))
                .slice((page - 1) * Number(p_limit), page * Number(p_limit))
            const items = [
                ...pageFor('active', Number(p_active_page)),
                ...pageFor('completed', Number(p_completed_page)),
                ...pageFor('revoked', Number(p_revoked_page)),
            ].map(row => ({
                enrollment: { points_awarded: false, last_accessed_lesson_id: null, last_accessed_at: null, completed_at: null, run_id: null, ...row,
                    completion_revoked_at: completions.get(row.id)?.revoked_at ?? null,
                    completion_revoked_reason: completions.get(row.id)?.revoked_reason ?? null,
                    section: sectionOf(row) },
                course: client._tables.courses.find(course => course.id === row.course_id),
                version: client._tables.course_versions.find(version => version.id === row.version_id),
                requiredLessonIds: ((config.rpcs?.academy_get_syllabus?.({ p_version_id: row.version_id }) ?? (client._tables.course_lessons ?? []).filter(lesson => lesson.version_id === row.version_id)) as Array<{ id: string }>).map(lesson => lesson.id),
            }))
            return { totals, items }
        },
        ...config.rpcs,
    } })
    return client
}
beforeEach(() => setup())
const answers = [{ question_id: QUESTION, selected_option_id: OPTION }]
const fail = (message: string) => () => { throw new Error(message) }

describe('enrollment', () => {
    it('requires an authenticated active Academy profile', async () => {
        setup({ user: null }); expect((await enrollInCourse(COURSE)).success).toBe(false)
        setup({ tables: { profiles: [{ id: USER, role: 'consultant', employment_status: 'exited' }] } })
        expect((await enrollInCourse(COURSE)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('allows learning without a trainer grant and obtains a pinned enrollment through the RPC', async () => {
        setup({ rpcs: { academy_enroll: () => ENROLLMENT } })
        expect(await enrollInCourse(COURSE)).toEqual({ success: true, data: { enrollmentId: ENROLLMENT, alreadyEnrolled: false } })
        expect(client.rpc).toHaveBeenCalledWith('academy_enroll', { p_course_id: COURSE })
        expect(client._tables.course_enrollments).toEqual([])
    })
    it('returns an existing self-paced enrollment idempotently', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_enroll: () => ENROLLMENT } })
        expect(await enrollInCourse(COURSE)).toEqual({ success: true, data: { enrollmentId: ENROLLMENT, alreadyEnrolled: true } })
        expect(client.rpc).toHaveBeenCalledWith('academy_enroll', { p_course_id: COURSE })
    })
    it('does not treat another learner or a live run as an existing self-paced enrollment', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ user_id: OTHER }), enrollmentRow({ id: RUN_ENROLLMENT, run_id: RUN })] }, rpcs: { academy_enroll: () => ENROLLMENT } })
        expect(await enrollInCourse(COURSE)).toEqual({ success: true, data: { enrollmentId: ENROLLMENT, alreadyEnrolled: false } })
    })
    it.each([{ code: 'published_version_required', error: 'Szkolenie wymaga zatwierdzonej wersji programu.' }, { code: 'select_course_run', error: 'Wybierz edycję szkolenia z kalendarza.' }])('surfaces enrollment rules from the database: $code', async ({ code, error }) => {
        setup({ rpcs: { academy_enroll: fail(code) } })
        expect(await enrollInCourse(COURSE)).toEqual({ success: false, error })
        expect(revalidatePath).not.toHaveBeenCalled()
    })
    it('rejects malformed course identifiers without an RPC', async () => {
        expect((await enrollInCourse('c1')).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
})

describe('pinned progress and lesson access', () => {
    it('requires the current learner’s enrollment before marking completion', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ user_id: OTHER })] } })
        expect((await markLessonComplete(COURSE, LESSON, ENROLLMENT)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('passes the exact run enrollment and lesson to the atomic progress RPC', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow(), enrollmentRow({ id: RUN_ENROLLMENT, run_id: RUN, version_id: VERSION })] }, rpcs: { academy_mark_lesson_complete: () => ({ streak: { current: 7, milestone_reached: true } }) } })
        expect(await markLessonComplete(COURSE, LESSON, RUN_ENROLLMENT)).toEqual({ success: true, data: { streak: { current: 7, milestone_reached: true } } })
        expect(client.rpc).toHaveBeenCalledWith('academy_mark_lesson_complete', { p_enrollment_id: RUN_ENROLLMENT, p_lesson_id: LESSON })
    })
    it('keeps repeat completion idempotency in the database instead of appending arrays client-side', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ completed_lessons: [LESSON] })] }, rpcs: { academy_mark_lesson_complete: () => ({ streak: null }) } })
        expect(await markLessonComplete(COURSE, LESSON)).toEqual({ success: true, data: { streak: null } })
        expect(client._tables.course_enrollments[0].completed_lessons).toEqual([LESSON])
        expect(client.rpc).toHaveBeenCalledWith('academy_mark_lesson_complete', { p_enrollment_id: ENROLLMENT, p_lesson_id: LESSON })
    })
    it('rejects inaccessible lessons based on the database verdict', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_mark_lesson_complete: fail('lesson_not_in_enrollment') } })
        expect(await markLessonComplete(COURSE, LESSON, ENROLLMENT)).toEqual({ success: false, error: 'Lekcja nie należy do Twojej wersji programu.' })
    })
    it('records resume position against the selected enrollment', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_record_lesson_access: () => null } })
        expect(await recordLessonAccess(COURSE, LESSON, ENROLLMENT)).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith('academy_record_lesson_access', { p_enrollment_id: ENROLLMENT, p_lesson_id: LESSON })
    })
})

describe('quiz and course completion', () => {
    it('requires authentication for quiz submission', async () => {
        setup({ user: null })
        expect((await submitQuizAttempt(COURSE, answers)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('loads quiz questions through the enrollment-scoped RPC', async () => {
        const questions = [{ question_id: QUESTION, question_order: 0, question_text: 'Pytanie', options: [{ id: OPTION, order_index: 0, option_text: 'Opcja' }] }]
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_get_quiz: () => questions } })
        expect(await getQuizForAttempt(COURSE, ENROLLMENT)).toEqual({ success: true, data: questions })
        expect(client.rpc).toHaveBeenCalledWith('academy_get_quiz', { p_enrollment_id: ENROLLMENT })
        expect(client.from).not.toHaveBeenCalledWith('course_quiz_options')
    })
    it('submits only selected answer IDs for the exact enrollment', async () => {
        const result = { score_percent: 80, passed: true, attempt_id: ATTEMPT, already_awarded: false, award_status: null }
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_submit_quiz: () => result } })
        expect(await submitQuizAttempt(COURSE, answers, ENROLLMENT)).toEqual({ success: true, data: result })
        expect(client.rpc).toHaveBeenCalledWith('academy_submit_quiz', { p_enrollment_id: ENROLLMENT, p_answers: answers })
        expect(client.rpc).not.toHaveBeenCalledWith('academy_complete_course', expect.anything())
    })
    it.each([{ invalidAnswers: [] }, { invalidAnswers: [{ question_id: 'bad', selected_option_id: OPTION }] }, { invalidAnswers: [...answers, ...answers] }])('rejects empty, malformed or duplicate answers before RPC', async ({ invalidAnswers }) => {
        expect((await submitQuizAttempt(COURSE, invalidAnswers)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('rejects a selected enrollment that belongs to a different course', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ course_id: id(11) })] } })
        expect((await submitQuizAttempt(COURSE, answers, ENROLLMENT)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('surfaces quiz RPC errors', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_submit_quiz: fail('one_answer_per_question_required') } })
        expect(await submitQuizAttempt(COURSE, answers)).toEqual({ success: false, error: 'Odpowiedz dokładnie raz na każde pytanie.' })
    })
    it('explains the rolling attempt limit returned by the quiz RPC', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_submit_quiz: fail('quiz_attempt_window_exhausted') } })
        expect(await submitQuizAttempt(COURSE, answers)).toEqual({ success: false, error: quizAttemptWindowMessage })
    })
    it.each([{ completed: false, reason: 'attendance_required' }, { completed: true, already_completed: true }])('returns the completion verdict without inventing eligibility: %j', async verdict => {
        setup({ tables: { course_enrollments: [enrollmentRow()] }, rpcs: { academy_complete_course: () => verdict } })
        expect(await completeAcademyCourse(COURSE, ENROLLMENT)).toEqual({ success: true, data: verdict })
        expect(client.rpc).toHaveBeenCalledWith('academy_complete_course', { p_enrollment_id: ENROLLMENT })
    })
    it('returns only the learner’s attempt for the selected enrollment', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ completed_at: '2026-09-22' })], course_quiz_attempts: [{ id: ATTEMPT, enrollment_id: ENROLLMENT, user_id: USER, score_percent: 80, passed: true, answers: 'private scoring data' }] } })
        expect(await getMyQuizResult(COURSE, ATTEMPT, ENROLLMENT)).toEqual({ success: true, data: { id: ATTEMPT, score: 80, passed: true, completed: true } })
        client._tables.course_quiz_attempts[0].user_id = OTHER
        expect((await getMyQuizResult(COURSE, ATTEMPT, ENROLLMENT)).success).toBe(false)
        client._tables.course_quiz_attempts[0].user_id = USER
        client._tables.course_quiz_attempts[0].enrollment_id = RUN_ENROLLMENT
        expect((await getMyQuizResult(COURSE, ATTEMPT, ENROLLMENT)).success).toBe(false)
    })
})

describe('ratings', () => {
    it('requires authentication', async () => { setup({ user: null }); expect((await submitRating(COURSE, 5)).success).toBe(false) })
    it.each([0, 6, 1.5])('rejects invalid rating %s', async value => { expect((await submitRating(COURSE, value)).success).toBe(false) })
    it('requires completion of all course rules, not just a passed quiz', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow()] } })
        expect(await submitRating(COURSE, 5)).toEqual({ success: false, error: 'Możesz ocenić kurs dopiero po spełnieniu wszystkich warunków ukończenia.' })
        expect(client._tables.course_ratings).toEqual([])
    })
    it('inserts then updates a rating after completion, trimming the comment', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ completed_at: '2026-09-22' })] } })
        expect((await submitRating(COURSE, 4, '  Dobry kurs  ')).success).toBe(true)
        expect(client._tables.course_ratings).toEqual([expect.objectContaining({ user_id: USER, course_id: COURSE, rating: 4, comment: 'Dobry kurs' })])
        expect((await submitRating(COURSE, 5, '')).success).toBe(true)
        expect(client._tables.course_ratings).toHaveLength(1)
        expect(client._tables.course_ratings[0]).toMatchObject({ rating: 5, comment: null })
    })
})

describe('my enrollments and version progress', () => {
    it('requires authentication and returns an empty list without enrollments', async () => {
        setup({ user: null }); expect((await getMyEnrollmentsPage()).success).toBe(false)
        setup(); expect(await getMyEnrollmentsPage()).toEqual({ success: true, data: { items: [], totals: { active: 0, completed: 0, revoked: 0 }, activePage: 1, completedPage: 1, revokedPage: 1, pageSize: 24 } })
    })
    it('uses lesson counts and metadata from the pinned version, filtering other users', async () => {
        setup({ tables: { courses: [courseRow()], course_enrollments: [enrollmentRow({ completed_lessons: [LESSON, id(41)] }), enrollmentRow({ id: id(32), user_id: OTHER })], course_lessons: [LESSON, id(41), id(42), id(43)].map(lesson => ({ id: lesson, course_id: COURSE, version_id: OLD_VERSION })).concat([{ id: id(44), course_id: COURSE, version_id: VERSION }]) } })
        const result = await getMyEnrollmentsPage()
        expect(result.success && result.data.items).toEqual([expect.objectContaining({ enrollment_id: ENROLLMENT, total_lessons: 4, progress_percent: 50, course: expect.objectContaining({ title: 'Zapisana wersja 1' }), version_id: OLD_VERSION })])
    })
    it('reserves 100 percent for completion of all rules and ignores foreign lesson IDs', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ completed_lessons: [LESSON, LESSON, id(999)] })], course_lessons: [{ id: LESSON, version_id: OLD_VERSION }] } })
        const incomplete = await getMyEnrollmentsPage()
        expect(incomplete.success && incomplete.data.items[0].progress_percent).toBe(99)
        expect(incomplete.success && incomplete.data.items[0].completed_lessons).toEqual([LESSON])
        client._tables.course_enrollments[0].completed_at = '2026-09-22'
        const completed = await getMyEnrollmentsPage()
        expect(completed.success && completed.data.items[0].progress_percent).toBe(100)
    })
    it('keeps separate live-run enrollments and handles programs without lessons', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ run_id: RUN }), enrollmentRow({ id: RUN_ENROLLMENT, run_id: id(51), version_id: VERSION })], course_runs: [{ id: RUN, status: 'published' }, { id: id(51), status: 'published' }], course_run_registrations: [{ run_id: RUN, enrollment_id: ENROLLMENT, user_id: USER, status: 'confirmed' }, { run_id: id(51), enrollment_id: RUN_ENROLLMENT, user_id: USER, status: 'confirmed' }] } })
        const result = await getMyEnrollmentsPage()
        expect(result.success && result.data.items.map(row => [row.enrollment_id, row.run_id, row.progress_percent]).sort()).toEqual([[ENROLLMENT, RUN, 0], [RUN_ENROLLMENT, id(51), 0]])
    })
    it('reaches history beyond the default 1,000-row Data API cap and keeps exact totals', async () => {
        const rows = Array.from({ length: 1005 }, (_, index) => enrollmentRow({ id: id(3000 + index) }))
        setup({ tables: { course_enrollments: rows } })
        const result = await getMyEnrollmentsPage({ activePage: 42, pageSize: 24 })
        expect(result.success && result.data.totals.active).toBe(1005)
        expect(result.success && result.data.items).toHaveLength(21)
        expect(result.success && result.data.items.at(-1)?.enrollment_id).toBe(id(3000))
        expect(client.rpc).toHaveBeenCalledWith('academy_my_enrollments_page', { p_active_page: 42, p_completed_page: 1, p_revoked_page: 1, p_limit: 24 })
    })
    it('fails closed when a page has fewer records than the reported count', async () => {
        setup({ rpcs: { academy_my_enrollments_page: () => ({ totals: { active: 25, completed: 0, revoked: 0 }, items: [] }) } })
        expect((await getMyEnrollmentsPage()).success).toBe(false)
    })
})


it('counts locked drip lessons through the syllabus without reading their content', async () => {
    setup({ tables: { course_enrollments: [enrollmentRow({ completed_lessons: [LESSON] })], course_lessons: [{ id: LESSON, version_id: OLD_VERSION }] }, rpcs: { academy_get_syllabus: () => [LESSON, id(41), id(42)].map(id => ({ id, version_id: OLD_VERSION })) } })
    const result = await getMyEnrollmentsPage()
    expect(result.success && result.data.items[0]).toMatchObject({ total_lessons: 3, progress_percent: 33 })
    expect(client.rpc).toHaveBeenCalledWith('academy_my_enrollments_page', { p_active_page: 1, p_completed_page: 1, p_revoked_page: 1, p_limit: 24 })
    expect(client.from).not.toHaveBeenCalledWith('course_lessons')
})

it('omits withdrawn or cancelled live enrollments while preserving a completed certificate', async () => {
    setup({ tables: { course_enrollments: [enrollmentRow({ run_id: RUN }), enrollmentRow({ id: RUN_ENROLLMENT, run_id: id(51), completed_at: '2026-09-20' })], course_runs: [{ id: RUN, status: 'cancelled' }], course_run_registrations: [{ run_id: RUN, enrollment_id: ENROLLMENT, user_id: USER, status: 'confirmed' }] } })
    const result = await getMyEnrollmentsPage()
    expect(result.success && result.data.items.map(row => row.enrollment_id)).toEqual([RUN_ENROLLMENT])
})
