import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'
import { academyFixture, courseRow, enrollmentRow, id, COURSE, DRAFT, ENROLLMENT, LESSON, OLD_VERSION, OTHER, USER, VERSION } from './academy-fixtures'
import { addLesson, beginCourseDraft, createCourse, deleteLesson, getCourseDetail, getCourseQuizForAuthor, getMyCourses, listPublishedCourses, reorderLessons, setQuizQuestions, submitForReview, updateCourse, updateLesson, uploadCourseAttachment } from '../courses'
import type { QuizQuestionInput } from '@/lib/types/learning'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
function setup(config: MockSupabaseConfig = {}) { client = academyFixture(config); return client }
beforeEach(() => setup())
const input = { title: 'Warsztat TypeScript', category: 'Backend' }
const fail = (message: string) => () => { throw new Error(message) }
const quiz = (): QuizQuestionInput[] => Array.from({ length: 4 }, (_, i) => ({ question_text: `Pytanie ${i + 1}`, options: Array.from({ length: 4 }, (_, j) => ({ option_text: `Opcja ${j + 1}`, is_correct: j === 0 })) }))

describe('course creation and trainer access', () => {
    it('rejects an unauthenticated caller before creation', async () => {
        setup({ user: null })
        expect(await createCourse(input)).toEqual({ success: false, error: 'Zaloguj się, aby korzystać z Akademii.' })
        expect(client.rpc).not.toHaveBeenCalled()
    })
    it.each([{ is_external: true }, { employment_status: 'exited' }, { role: 'internal' }])('rejects an ineligible profile %j', async patch => {
        setup({ tables: { profiles: [{ id: USER, role: 'consultant', ...patch }] } })
        expect((await createCourse(input)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalled()
    })
    it.each([{ grants: [] }, { grants: [{ user_id: USER, can_train: false }] }, { grants: [{ user_id: USER, can_train: true, revoked_at: '2026-09-20' }] }])('requires a current trainer capability', async ({ grants }) => {
        setup({ tables: { academy_user_capabilities: grants } })
        expect(await createCourse(input)).toEqual({ success: false, error: 'Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.' })
        expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['academy_rollout_access'])
    })
    it.each([{ title: 'AB' }, { category: '   ' }, { title: 'x'.repeat(201) }, { duration_minutes: 0 }])('validates metadata before RPC: %j', async patch => {
        expect((await createCourse({ ...input, ...patch })).success).toBe(false)
        expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['academy_rollout_access'])
    })
    it('returns the database-generated slug and passes trimmed Polish metadata', async () => {
        setup({ rpcs: { academy_create_course: () => ({ course_id: COURSE, slug: 'latwa-sciezka-db' }) } })
        expect(await createCourse({ ...input, title: '  Łatwa ścieżka  ', tags: ['typescript'], level: 'beginner' })).toEqual({ success: true, data: { courseId: COURSE, slug: 'latwa-sciezka-db' } })
        expect(client.rpc).toHaveBeenCalledWith('academy_create_course', { p_input: { title: 'Łatwa ścieżka', category: 'Backend', tags: ['typescript'], level: 'beginner', course_type: 'consultant', is_official: false } })
        expect(client._tables.courses).toHaveLength(1)
    })
    it('cannot spoof company/official designation as a consultant', async () => {
        setup({ rpcs: { academy_create_course: () => ({ course_id: COURSE, slug: 'kurs' }) } })
        await createCourse({ ...input, course_type: 'company', is_official: true })
        expect(client.rpc).toHaveBeenCalledWith('academy_create_course', { p_input: { ...input, course_type: 'consultant', is_official: false } })
    })
    it('allows an administrator without a trainer grant to create an official company course', async () => {
        setup({ tables: { profiles: [{ id: USER, role: 'admin' }], academy_user_capabilities: [] }, rpcs: { academy_create_course: () => ({ course_id: COURSE, slug: 'kurs' }) } })
        expect((await createCourse({ ...input, course_type: 'company', is_official: true })).success).toBe(true)
        expect(client.rpc).toHaveBeenCalledWith('academy_create_course', { p_input: { ...input, course_type: 'company', is_official: true } })
    })
    it('leaves omitted defaults to the database', async () => {
        setup({ rpcs: { academy_create_course: () => ({ course_id: COURSE, slug: 'kurs' }) } })
        await createCourse(input)
        expect(client.rpc.mock.calls.find(([name]) => name === 'academy_create_course')?.[1]?.p_input).not.toHaveProperty('level')
        expect(client.rpc.mock.calls.find(([name]) => name === 'academy_create_course')?.[1]?.p_input).not.toHaveProperty('completion_rules')
    })
    it('surfaces database failure without invalidating cache', async () => {
        setup({ rpcs: { academy_create_course: fail('Tworzenie odrzucone.') } })
        expect(await createCourse(input)).toEqual({ success: false, error: 'Nie udało się wykonać operacji. Odśwież stronę i spróbuj ponownie.' })
        expect(revalidatePath).not.toHaveBeenCalled()
    })
})

describe('draft changes and moderation', () => {
    it('rejects an unauthenticated update', async () => { setup({ user: null }); expect((await updateCourse(COURSE, input)).success).toBe(false) })
    it.each(['invalid-id', COURSE])('surfaces invalid IDs or denied draft mutation: %s', async courseId => {
        setup({ rpcs: { academy_update_course: fail('Brak dostępu do wersji roboczej.') } })
        expect((await updateCourse(courseId, input)).success).toBe(false)
        expect(client._tables.courses[0].title).toBe('Opublikowany program')
    })
    it.each(['consultant', 'admin'])('updates through the draft RPC for %s', async role => {
        setup({ tables: { profiles: [{ id: USER, role }] }, rpcs: { academy_update_course: () => null } })
        expect(await updateCourse(COURSE, { title: 'Nowy tytuł' })).toEqual({ success: true, data: { slug: 'warsztat' } })
        expect(client.rpc).toHaveBeenCalledWith('academy_update_course', { p_course_id: COURSE, p_patch: { title: 'Nowy tytuł' } })
    })
    it('rejects invalid draft metadata before mutation', async () => { expect((await updateCourse(COURSE, { title: 'AB' })).success).toBe(false); expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['academy_rollout_access']) })
    it('creates a successor only through the immutable-version RPC', async () => {
        setup({ rpcs: { academy_begin_draft: () => DRAFT } })
        expect(await beginCourseDraft(COURSE)).toEqual({ success: true, data: DRAFT })
        expect(client.rpc).toHaveBeenCalledWith('academy_begin_draft', { p_course_id: COURSE })
        expect(client._tables.course_versions[0].status).toBe('published')
    })
    it('filters the trainer list by owner and overlays draft metadata', async () => {
        setup({ tables: { courses: [courseRow(), courseRow({ id: id(11), author_id: OTHER })] } })
        const result = await getMyCourses()
        expect(result.success && result.data.map(c => [c.id, c.title, c.version_id])).toEqual([[COURSE, 'Roboczy program', DRAFT]])
    })
    it('does not list authored courses after capability revocation', async () => {
        setup({ tables: { academy_user_capabilities: [] } })
        expect((await getMyCourses()).success).toBe(false)
    })
    it('submits only an authenticated trainer through the validation RPC', async () => {
        setup({ rpcs: { academy_submit_for_review: () => null } })
        expect(await submitForReview(COURSE)).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith('academy_submit_for_review', { p_course_id: COURSE })
    })
    it.each([
        ['at_least_one_lesson_required', 'Dodaj co najmniej jedną lekcję.'],
        ['quiz_requires_four_to_ten_questions', 'Quiz musi zawierać od 4 do 10 pytań.'],
        ['version_in_review', 'Wersja oczekuje na decyzję administratora i jest zablokowana do edycji.'],
    ])('explains publication validation from DB: %s', async (reason, guidance) => {
        setup({ rpcs: { academy_submit_for_review: fail(reason) } })
        expect(await submitForReview(COURSE)).toEqual({ success: false, error: guidance })
        expect(revalidatePath).not.toHaveBeenCalled()
    })
    it('rejects unauthenticated moderation submission', async () => { setup({ user: null }); expect((await submitForReview(COURSE)).success).toBe(false) })
})

describe('catalog and pinned detail', () => {
    it('requires a signed-in catalog reader', async () => { setup({ user: null }); expect(await listPublishedCourses()).toEqual({ success: false, error: 'Brak autoryzacji' }) })
    it('excludes drafts and rows without a published version', async () => {
        setup({ tables: { courses: [courseRow(), courseRow({ id: id(11), status: 'draft' }), courseRow({ id: id(12), published_version_id: null })] } })
        const result = await listPublishedCourses()
        expect(result.success && result.data.items.map(c => c.id)).toEqual([COURSE])
        expect(result.success && result.data.items[0].author_name).toBe('Trener')
    })
    it('combines delivery mode, category, source, level, tag and search filters', async () => {
        setup({ tables: { courses: [courseRow({ delivery_mode: 'live', course_type: 'company' }), courseRow({ id: id(11), delivery_mode: 'self_paced' }), courseRow({ id: id(12), title: 'Inny kurs', delivery_mode: 'live', course_type: 'company' })] } })
        const result = await listPublishedCourses({ delivery_mode: 'live', category: 'Backend', course_type: 'company', level: 'beginner', tag: 'typescript', search: 'Opublikowany' })
        expect(result.success && result.data.items.map(c => c.id)).toEqual([COURSE])
    })
    it('paginates while retaining the filtered total', async () => {
        setup({ tables: { courses: [courseRow(), courseRow({ id: id(11) }), courseRow({ id: id(12) })] } })
        const result = await listPublishedCourses({ page: 2, limit: 1 })
        expect(result.success && result.data.total).toBe(3)
        expect(result.success && result.data.items.map(c => c.id)).toEqual([id(11)])
    })
    it('requires auth and reports a missing detail', async () => {
        setup({ user: null }); expect((await getCourseDetail('warsztat')).success).toBe(false)
        setup({ tables: { courses: [] } }); expect((await getCourseDetail('warsztat')).success).toBe(false)
    })
    it('uses the enrollment version and its materials after a new publication', async () => {
        const syllabus = [{ id: LESSON, title: 'Stara lekcja', order_index: 0 }]
        setup({ tables: { course_enrollments: [enrollmentRow({ completed_lessons: [LESSON], lesson_completion_dates: { [LESSON]: '2026-09-21' } })], course_lessons: [{ ...syllabus[0], course_id: COURSE, version_id: OLD_VERSION, content_md: 'Treść starej wersji', attachments: [] }, { id: id(41), version_id: VERSION, content_md: 'Nowa treść' }] }, rpcs: { academy_can_manage_course: () => false, academy_get_syllabus: () => syllabus, academy_quiz_question_count: () => 4 } })
        const result = await getCourseDetail('warsztat', { enrollmentId: ENROLLMENT })
        expect(result.success && result.data).toMatchObject({ title: 'Zapisana wersja 1', version_id: OLD_VERSION, enrollment_id: ENROLLMENT, completed_lesson_ids: [LESSON], lessons: [{ content_md: 'Treść starej wersji', content_available: true }] })
        expect(client.rpc).toHaveBeenCalledWith('academy_get_syllabus', { p_version_id: OLD_VERSION })
    })
    it('does not resolve another user’s enrollment', async () => {
        setup({ tables: { course_enrollments: [enrollmentRow({ user_id: OTHER })] } })
        expect(await getCourseDetail(COURSE, { enrollmentId: ENROLLMENT })).toEqual({ success: false, error: 'Nie masz dostępu do tego zapisu.' })
    })
    it('shows only syllabus to an unregistered reader', async () => {
        setup({ rpcs: { academy_can_manage_course: () => false, academy_get_syllabus: () => [{ id: LESSON, content_md: 'must be redacted', attachments: [{ name: 'private.pdf' }] }], academy_quiz_question_count: () => 4 } })
        const result = await getCourseDetail(COURSE)
        expect(result.success && result.data.lessons).toEqual([expect.objectContaining({ content_available: false, content_md: null, video_url: null, attachments: [] })])
    })
    it('uses the draft in author mode and rejects unauthorized draft access', async () => {
        setup({ rpcs: { academy_get_syllabus: () => [], academy_quiz_question_count: () => 0 } })
        const result = await getCourseDetail(COURSE, { author: true })
        expect(result.success && result.data.version_id).toBe(DRAFT)
        setup({ rpcs: { academy_can_manage_course: () => false } })
        expect((await getCourseDetail(COURSE, { author: true })).success).toBe(false)
    })
})

describe('lesson and quiz authoring', () => {
    it('rejects unauthenticated or unauthorized lesson creation', async () => {
        setup({ user: null }); expect((await addLesson(COURSE, { title: 'Lekcja' })).success).toBe(false)
        setup({ rpcs: { academy_can_manage_course: () => false } }); expect((await addLesson(COURSE, { title: 'Lekcja' })).success).toBe(false)
    })
    it('rejects an empty lesson title', async () => { expect((await addLesson(COURSE, { title: ' ' })).success).toBe(false) })
    it('appends within the draft version, ignoring indices in older versions', async () => {
        setup({ tables: { course_lessons: [{ id: LESSON, course_id: COURSE, version_id: DRAFT, order_index: 2 }, { id: id(41), course_id: COURSE, version_id: VERSION, order_index: 99 }] } })
        expect((await addLesson(COURSE, { title: ' Nowa lekcja ' })).success).toBe(true)
        expect(client._tables.course_lessons[2]).toMatchObject({ version_id: DRAFT, order_index: 3, title: 'Nowa lekcja' })
    })
    it('locks published lessons and quizzes until a successor draft exists', async () => {
        setup({ tables: { courses: [courseRow({ draft_version_id: null })] } })
        expect((await addLesson(COURSE, { title: 'Lekcja' })).success).toBe(false)
        expect((await setQuizQuestions(COURSE, quiz())).success).toBe(false)
    })
    it('updates and deletes authorized draft lessons', async () => {
        setup({ tables: { course_lessons: [{ id: LESSON, course_id: COURSE, version_id: DRAFT, title: 'Lekcja' }] } })
        expect((await updateLesson(LESSON, { title: ' Zmieniona ' })).success).toBe(true)
        expect(client._tables.course_lessons[0].title).toBe('Zmieniona')
        expect((await deleteLesson(LESSON)).success).toBe(true)
        expect(client._tables.course_lessons).toEqual([])
    })
    it('reorders through the transactional RPC', async () => {
        setup({ rpcs: { academy_reorder_lessons: () => null } })
        expect((await reorderLessons(COURSE, [id(41), LESSON])).success).toBe(true)
        expect(client.rpc).toHaveBeenCalledWith('academy_reorder_lessons', { p_course_id: COURSE, p_lesson_ids: [id(41), LESSON] })
    })
    it.each([3, 11])('rejects a quiz with %i questions', async count => {
        expect((await setQuizQuestions(COURSE, Array.from({ length: count }, () => quiz()[0]))).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_replace_quiz', expect.anything())
    })
    it.each(['missing_question', 'missing_option', 'three_options', 'two_correct', 'none_correct'])('rejects incomplete quiz: %s', async scenario => {
        const questions = quiz()
        if (scenario === 'missing_question') questions[0].question_text = ' '
        if (scenario === 'missing_option') questions[0].options[0].option_text = ' '
        if (scenario === 'three_options') questions[0].options.pop()
        if (scenario === 'two_correct') questions[0].options[1].is_correct = true
        if (scenario === 'none_correct') questions[0].options[0].is_correct = false
        expect((await setQuizQuestions(COURSE, questions)).success).toBe(false)
    })
    it('replaces a valid quiz atomically and surfaces database rejection', async () => {
        const questions = quiz()
        setup({ rpcs: { academy_replace_quiz: () => null } })
        expect((await setQuizQuestions(COURSE, questions)).success).toBe(true)
        expect(client.rpc).toHaveBeenCalledWith('academy_replace_quiz', { p_course_id: COURSE, p_questions: questions })
        setup({ rpcs: { academy_replace_quiz: fail('version_not_editable') } })
        expect(await setQuizQuestions(COURSE, questions)).toEqual({ success: false, error: 'Ta wersja nie jest już edytowalna. Odśwież stronę lub utwórz nowy szkic.' })
    })
    it('returns answer keys only from the managed draft version', async () => {
        setup({ tables: { course_quiz_questions: [{ id: id(60), course_id: COURSE, version_id: DRAFT, order_index: 0, question_text: 'Robocze' }, { id: id(61), course_id: COURSE, version_id: VERSION, question_text: 'Stare' }], course_quiz_options: [{ id: id(70), question_id: id(60), order_index: 0, option_text: 'Odpowiedź', is_correct: true }] } })
        expect(await getCourseQuizForAuthor(COURSE)).toEqual({ success: true, data: [{ id: id(60), order_index: 0, question_text: 'Robocze', options: [{ id: id(70), order_index: 0, option_text: 'Odpowiedź', is_correct: true }] }] })
    })
    it('blocks the legacy attachment upload bypass', async () => {
        expect((await uploadCourseAttachment(new FormData())).success).toBe(false)
        expect(client.storage.from).not.toHaveBeenCalled()
    })
})


describe('course lifecycle is independent of the selected version', () => {
    it('preserves archived status for author preview of a draft and blocks lesson mutations', async () => {
        setup({ tables: { courses: [courseRow({ status: 'archived' })] }, rpcs: { academy_get_syllabus: () => [], academy_quiz_question_count: () => 0 } })
        const detail = await getCourseDetail(COURSE, { author: true })
        expect(detail.success && detail.data).toMatchObject({ status: 'archived', version_status: 'draft', version_id: DRAFT })
        const result = await addLesson(COURSE, { title: 'Nowa lekcja', content_md: 'Treść' })
        expect(result.success).toBe(false)
        expect(client._tables.course_lessons).toHaveLength(0)
    })
    it('keeps the published course visible as published while its draft remains editable', async () => {
        const result = await getMyCourses()
        expect(result.success && result.data[0]).toMatchObject({ status: 'published', version_status: 'draft' })
        expect((await addLesson(COURSE, { title: 'Nowa lekcja', content_md: 'Treść' })).success).toBe(true)
    })
})
