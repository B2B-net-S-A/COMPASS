'use server'

import { academyClient, requireAcademyContext, academyAction, assertDatabaseResult } from '@/lib/academy/server'
import { courseMetadataSchema, loadAcademyCourse, withCourseVersion, type CourseVersion } from '@/lib/academy/course-data'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import {
    QUIZ_MIN_QUESTIONS,
    QUIZ_MAX_QUESTIONS,
    QUIZ_OPTIONS_PER_QUESTION,
    type Course,
    type CourseAttachment,
    type CourseDetail,
    type CourseLesson,
    type CourseListItem,
    type CourseQuizQuestionAuthor,
    type CreateCourseInput,
    type CreateLessonInput,
    type ListCoursesFilters,
    type QuizQuestionInput,
    type UpdateCoursePatch,
    type UpdateLessonPatch,
    type ActionResult,
} from '@/lib/types/learning'

// ============================================================
// Helpers
// ============================================================
// ============================================================
// Server Actions — author + catalog
// ============================================================

/** Creates a draft through the same database boundary used by direct API clients. */
export async function createCourse(input: CreateCourseInput): Promise<ActionResult<{ courseId: string; slug: string }>> {
    return academyAction('course.create', async () => {
        const { client, access } = await requireAcademyContext({ trainer: true })
        const parsed = courseMetadataSchema.extend({ course_type: z.enum(['company', 'consultant']).optional(), is_official: z.boolean().optional() }).parse(input)
        const { data, error } = await client.rpc('academy_create_course', { p_input: { ...parsed, course_type: access.isAdmin ? parsed.course_type ?? 'consultant' : 'consultant', is_official: access.isAdmin && parsed.course_type === 'company' && parsed.is_official === true } })
        assertDatabaseResult(error)
        revalidatePath('/learning/tworze')
        return { courseId: data.course_id as string, slug: data.slug as string }
    })
}

export async function updateCourse(courseId: string, patch: UpdateCoursePatch): Promise<ActionResult<{ slug: string }>> {
    return academyAction('course.update', async () => {
        const { client, access } = await requireAcademyContext({ trainer: true })
        const parsed = courseMetadataSchema.partial().parse(patch)
        const { error } = await client.rpc('academy_update_course', { p_course_id: z.uuid().parse(courseId), p_patch: parsed })
        assertDatabaseResult(error)
        const { course } = await loadAcademyCourse(client, access.userId, courseId, { author: true })
        revalidatePath('/learning/tworze')
        revalidatePath(`/learning/tworze/${courseId}/edit`)
        return { slug: course.slug }
    })
}

export async function beginCourseDraft(courseId: string): Promise<ActionResult<string>> {
    return academyAction('course.begin_draft', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_begin_draft', { p_course_id: z.uuid().parse(courseId) })
        assertDatabaseResult(error)
        revalidatePath('/learning/tworze')
        revalidatePath(`/learning/tworze/${courseId}/edit`)
        return data as string
    })
}

/**
 * Lista kursów aktualnego usera w roli autora (wszystkie statusy).
 */
export async function getMyCourses(): Promise<ActionResult<Course[]>> {
    return academyAction('course.mine', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_teaching_courses')
        assertDatabaseResult(error)
        const courses = (data ?? []) as Course[]
        const ids = courses.map(c => c.can_edit ? c.draft_version_id ?? c.published_version_id : c.published_version_id).filter((id): id is string => !!id)
        if (!ids.length) return courses
        const { data: versions, error: versionError } = await client.from('course_versions').select('*').in('id', ids)
        assertDatabaseResult(versionError)
        const byId = new Map((versions as CourseVersion[] ?? []).map(v => [v.id, v]))
        return courses.map(c => {
            const version = byId.get((c.can_edit ? c.draft_version_id ?? c.published_version_id : c.published_version_id) ?? '')
            return version ? withCourseVersion(c, version) : c
        })
    })
}

/**
 * Katalog opublikowanych kursów. Filtry: kategoria, tag, poziom, search po tytule/opisie.
 * Sortowanie: newest (published_at desc), popular (enrollments_count desc), top_rated (avg_rating desc).
 */
export async function listPublishedCourses(filters: ListCoursesFilters = {}): Promise<ActionResult<{ items: CourseListItem[]; total: number }>> {
    try {
        const supabase = academyClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const page = Math.max(1, filters.page ?? 1)
        const limit = Math.min(50, Math.max(1, filters.limit ?? 12))
        const from = (page - 1) * limit
        const to = from + limit - 1

        let query = supabase
            .from('courses')
            .select('*', { count: 'exact' })
            .eq('status', 'published')
            .eq('legacy_review_required', false)
            .not('published_version_id', 'is', null)

        if (filters.author_id) query = query.eq('author_id', z.uuid().parse(filters.author_id))
        if (filters.instructor_id) {
            const id = z.uuid().parse(filters.instructor_id)
            const { data: instructors, error: instructorError } = await supabase.rpc('academy_catalog_instructors')
            assertDatabaseResult(instructorError)
            const courses = (instructors as Array<{ id: string; courseIds: string[] }> ?? []).find(person => person.id === id)?.courseIds ?? []
            if (!courses.length) return { success: true, data: { items: [], total: 0 } }
            query = query.in('id', courses)
        }
        if (filters.category) query = query.eq('category', filters.category)
        if (filters.level) query = query.eq('level', filters.level)
        if (filters.delivery_mode) query = query.eq('delivery_mode', filters.delivery_mode)
        if (filters.course_type) query = query.eq('course_type', filters.course_type)
        if (filters.tag) query = query.contains('tags', [filters.tag])
        if (filters.search && filters.search.trim().length > 0) {
            const s = `%${filters.search.trim().slice(0, 100).replace(/[,%_()]/g, '')}%`
            query = query.or(`title.ilike.${s},description.ilike.${s}`)
        }

        switch (filters.orderBy) {
            case 'popular':
                query = query.order('enrollments_count', { ascending: false })
                break
            case 'top_rated':
                query = query.order('avg_rating', { ascending: false })
                break
            case 'newest':
            default:
                query = query.order('published_at', { ascending: false })
        }

        query = query.order('id', { ascending: true }).range(from, to)

        const { data, error, count } = await query
        if (error) throw error

        const courses = (data ?? []) as Course[]

        // Pull author profiles in a separate query (no Supabase embed → mockable)
        const authorIds = Array.from(new Set(courses.map((c) => c.author_id)))
        const authorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        if (authorIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', authorIds)
            for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) {
                authorMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
            }
        }

        const items: CourseListItem[] = courses.map((c) => ({
            ...c,
            author_name: authorMap.get(c.author_id)?.full_name ?? null,
            author_avatar_url: authorMap.get(c.author_id)?.avatar_url ?? null,
        }))

        return { success: true, data: { items, total: count ?? items.length } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania katalogu'
        logger.error({ event: 'courses.list_published.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Szczegóły kursu po slug (lub UUID). Zwraca pełną listę lekcji + liczbę pytań quizu
 * (bez treści pytań i opcji — te ładujemy oddzielnie przez RPC `get_quiz_for_attempt`
 * w fazie 4). Ujawnia metadane visible-to-user wg RLS (published OR own OR admin).
 */
export async function getCourseDetail(slugOrId: string, options: { author?: boolean; enrollmentId?: string; publishedOnly?: boolean; previewVersionId?: string } = {}): Promise<ActionResult<CourseDetail>> {
    return academyAction('course.detail', async () => {
        const { client, access } = await requireAcademyContext()
        const { course, enrollment } = await loadAcademyCourse(client, access.userId, slugOrId, options)
        const [{ data: author, error: authorError }, { data: rating, error: ratingError }] = await Promise.all([
            client.from('profiles').select('full_name,avatar_url').eq('id', course.author_id).maybeSingle(),
            client.from('course_ratings').select('rating,comment').eq('course_id', course.id).eq('user_id', access.userId).maybeSingle(),
        ])
        assertDatabaseResult(authorError)
        assertDatabaseResult(ratingError)
        const { data: canManage, error: accessError } = await client.rpc('academy_can_preview_version', { p_version_id: course.version_id })
        assertDatabaseResult(accessError)
        const [lessonsResult, syllabusResult] = await Promise.all([
            enrollment || canManage
                ? client.from('course_lessons').select('*').eq('version_id', course.version_id).order('order_index')
                : Promise.resolve({ data: [], error: null }),
            client.rpc('academy_get_syllabus', { p_version_id: course.version_id }),
        ])
        assertDatabaseResult(lessonsResult.error)
        assertDatabaseResult(syllabusResult.error)
        const materialMap = new Map<string, CourseLesson>((lessonsResult.data ?? []).map((lesson: CourseLesson) => [lesson.id, lesson]))
        const { data: count, error: quizError } = await client.rpc('academy_quiz_question_count', { p_version_id: course.version_id })
        assertDatabaseResult(quizError)
        return {
            ...course,
            author_name: author?.full_name ?? null,
            author_avatar_url: author?.avatar_url ?? null,
            lessons: (syllabusResult.data ?? []).map((summary: CourseLesson) => {
                const lesson = materialMap.get(summary.id)
                return { ...summary, ...lesson, content_available: !!lesson, content_md: lesson?.content_md ?? null, video_url: lesson?.video_url ?? null, attachments: Array.isArray(lesson?.attachments) ? lesson.attachments : [] }
            }),
            quiz_questions_count: count ?? 0,
            is_enrolled: !!enrollment,
            enrollment_id: enrollment?.id ?? null,
            run_id: enrollment?.run_id ?? null,
            completed_at: enrollment?.completed_at ?? null,
            completion_revoked_at: enrollment?.completion_revoked_at ?? null,
            completion_revoked_reason: enrollment?.completion_revoked_reason ?? null,
            completed_lesson_ids: Array.isArray(enrollment?.completed_lessons) ? enrollment.completed_lessons : [],
            lesson_completion_dates: enrollment?.lesson_completion_dates ?? {},
            user_rating: rating ? { rating: rating.rating, comment: rating.comment } : null,
        }
    })
}

// ============================================================
// Authoring helpers — author/admin only
// ============================================================

async function loadCourseForAuthor(
    supabase: ReturnType<typeof academyClient>, courseId: string, userId: string,
): Promise<Course | null> {
    const { data: allowed, error } = await supabase.rpc('academy_can_manage_course', { p_course_id: courseId })
    assertDatabaseResult(error)
    if (!allowed) return null
    const { course } = await loadAcademyCourse(supabase, userId, courseId, { author: true })
    return course
}

/**
 * Pobiera lekcje kursu (uporządkowane). Zwraca załączniki sparsowane do tablicy.
 * Author/admin widzi wszystkie statusy; student tylko gdy course.status='published' (przez RLS).
 */
export async function getCourseLessons(courseId: string, options: { author?: boolean; enrollmentId?: string; publishedOnly?: boolean; previewVersionId?: string } = {}): Promise<ActionResult<CourseLesson[]>> {
    const result = await getCourseDetail(courseId, options)
    return result.success ? { success: true, data: result.data.lessons } : result
}

/**
 * Tworzy nową lekcję na końcu listy (next order_index). Author/admin only.
 */
export async function addLesson(courseId: string, input: CreateLessonInput): Promise<ActionResult<{ lessonId: string }>> {
    try {
        const supabase = academyClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień lub kurs nie istnieje' }
        if (!['draft', 'rejected'].includes(course.status)) return { success: false, error: 'Utwórz nową wersję roboczą, aby edytować szkolenie.' }

        if (!input.title || input.title.trim().length < 2) {
            return { success: false, error: 'Tytuł lekcji jest wymagany' }
        }

        // Determine next order_index
        const { data: existing } = await supabase
            .from('course_lessons')
            .select('order_index')
            .eq('course_id', courseId)
            .eq('version_id', course.version_id)
            .order('order_index', { ascending: false })
            .limit(1)
        const nextIndex = existing && existing.length > 0 ? (existing[0] as { order_index: number }).order_index + 1 : 0

        const { data, error } = await supabase
            .from('course_lessons')
            .insert({
                course_id: courseId,
                version_id: course.version_id,
                order_index: nextIndex,
                title: input.title.trim(),
                content_md: input.content_md?.trim() || null,
                video_url: input.video_url?.trim() || null,
                estimated_minutes: input.estimated_minutes ?? null,
                attachments: (input.attachments ?? []) as unknown as import('@/lib/supabase/database.types').Json,
            })
            .select('id')
            .single()

        if (error) throw error

        revalidatePath(`/learning/tworze/${courseId}/edit`)
        revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: { lessonId: data.id } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd dodawania lekcji'
        logger.error({ event: 'courses.add_lesson.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Aktualizuje pola lekcji.
 */
export async function updateLesson(lessonId: string, patch: UpdateLessonPatch): Promise<ActionResult<{ courseId: string }>> {
    try {
        const supabase = academyClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: lesson, error: lessonErr } = await supabase
            .from('course_lessons')
            .select('id, course_id')
            .eq('id', lessonId)
            .single()
        if (lessonErr || !lesson) return { success: false, error: 'Lekcja nie istnieje' }

        const course = await loadCourseForAuthor(supabase, lesson.course_id, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień' }
        if (!['draft', 'rejected'].includes(course.status)) return { success: false, error: 'Utwórz nową wersję roboczą, aby edytować szkolenie.' }

        const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (patch.title !== undefined) {
            if (patch.title.trim().length < 2) return { success: false, error: 'Tytuł lekcji jest wymagany' }
            cleanPatch.title = patch.title.trim()
        }
        if (patch.content_md !== undefined) cleanPatch.content_md = patch.content_md?.trim() || null
        if (patch.video_url !== undefined) cleanPatch.video_url = patch.video_url?.trim() || null
        if (patch.estimated_minutes !== undefined) cleanPatch.estimated_minutes = patch.estimated_minutes
        if (patch.attachments !== undefined) cleanPatch.attachments = patch.attachments

        const { error } = await supabase
            .from('course_lessons')
            .update(cleanPatch)
            .eq('id', lessonId)

        if (error) throw error

        revalidatePath(`/learning/tworze/${course.id}/edit`)
        revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: { courseId: course.id } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd aktualizacji lekcji'
        logger.error({ event: 'courses.update_lesson.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Zmienia kolejność lekcji. orderedIds = lista wszystkich lekcji w kursie po nowej kolejności.
 * Implementacja two-phase: najpierw przesuwamy do offsetu (+1000) by uniknąć kolizji UNIQUE,
 * potem ustawiamy docelowe indeksy.
 */
export async function reorderLessons(courseId: string, orderedIds: string[]): Promise<ActionResult<void>> {
    try {
        const supabase = academyClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień lub kurs nie istnieje' }
        if (!['draft', 'rejected'].includes(course.status)) return { success: false, error: 'Utwórz nową wersję roboczą, aby edytować szkolenie.' }

        const { error } = await supabase.rpc('academy_reorder_lessons', { p_course_id: courseId, p_lesson_ids: orderedIds })
        assertDatabaseResult(error)

        revalidatePath(`/learning/tworze/${courseId}/edit`)
        revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zmiany kolejności'
        logger.error({ event: 'courses.reorder_lessons.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Usuwa lekcję. Pozostałe lekcje zachowują swoje order_index (luki są OK — UI je ignoruje).
 */
export async function deleteLesson(lessonId: string): Promise<ActionResult<{ courseId: string }>> {
    try {
        const supabase = academyClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: lesson, error: lessonErr } = await supabase
            .from('course_lessons')
            .select('id, course_id')
            .eq('id', lessonId)
            .single()
        if (lessonErr || !lesson) return { success: false, error: 'Lekcja nie istnieje' }

        const course = await loadCourseForAuthor(supabase, lesson.course_id, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień' }
        if (!['draft', 'rejected'].includes(course.status)) return { success: false, error: 'Utwórz nową wersję roboczą, aby edytować szkolenie.' }

        const { error } = await supabase.from('course_lessons').delete().eq('id', lessonId)
        if (error) throw error

        revalidatePath(`/learning/tworze/${course.id}/edit`)
        revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: { courseId: course.id } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd usuwania lekcji'
        logger.error({ event: 'courses.delete_lesson.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Pobiera quiz dla autora — z polem is_correct (do edycji).
 * RLS na course_quiz_options pozwala na SELECT tylko autorowi/adminowi.
 */
export async function getCourseQuizForAuthor(courseId: string, view: { publishedOnly?: boolean } = {}): Promise<ActionResult<CourseQuizQuestionAuthor[]>> {
    try {
        const supabase = academyClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = view.publishedOnly
            ? (await loadAcademyCourse(supabase, user.id, courseId, { publishedOnly: true })).course
            : await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień' }

        const { data: questions, error: qErr } = await supabase
            .from('course_quiz_questions')
            .select('id, order_index, question_text')
            .eq('course_id', courseId)
            .eq('version_id', course.version_id)
            .order('order_index', { ascending: true })
        if (qErr) throw qErr

        const questionIds = (questions ?? []).map((q) => (q as { id: string }).id)
        const { data: options, error: oErr } = questionIds.length > 0
            ? await supabase
                .from('course_quiz_options')
                .select('id, question_id, order_index, option_text, is_correct')
                .in('question_id', questionIds)
                .order('order_index', { ascending: true })
            : { data: [], error: null }
        if (oErr) throw oErr

        const optionsByQ = new Map<string, CourseQuizQuestionAuthor['options']>()
        for (const o of (options ?? []) as Array<{ id: string; question_id: string; order_index: number; option_text: string; is_correct: boolean }>) {
            const arr = optionsByQ.get(o.question_id) ?? []
            arr.push({ id: o.id, order_index: o.order_index, option_text: o.option_text, is_correct: o.is_correct })
            optionsByQ.set(o.question_id, arr)
        }

        const result: CourseQuizQuestionAuthor[] = ((questions ?? []) as Array<{ id: string; order_index: number; question_text: string }>).map((q) => ({
            id: q.id,
            order_index: q.order_index,
            question_text: q.question_text,
            options: optionsByQ.get(q.id) ?? [],
        }))

        return { success: true, data: result }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania quizu'
        logger.error({ event: 'courses.get_quiz.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Upsertuje cały quiz: kasuje istniejące pytania (CASCADE → opcje) i wstawia nowe.
 * Walidacja: 4-10 pytań, każde z dokładnie 4 opcjami i 1 oznaczoną is_correct=true.
 */
export async function setQuizQuestions(courseId: string, questions: QuizQuestionInput[]): Promise<ActionResult<void>> {
    try {
        const supabase = academyClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień lub kurs nie istnieje' }
        if (!['draft', 'rejected'].includes(course.status)) return { success: false, error: 'Utwórz nową wersję roboczą, aby edytować szkolenie.' }

        // Validation
        if (questions.length < QUIZ_MIN_QUESTIONS || questions.length > QUIZ_MAX_QUESTIONS) {
            return { success: false, error: `Quiz musi mieć od ${QUIZ_MIN_QUESTIONS} do ${QUIZ_MAX_QUESTIONS} pytań (jest ${questions.length})` }
        }
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i]
            if (!q.question_text || q.question_text.trim().length === 0) {
                return { success: false, error: `Pytanie ${i + 1}: treść jest wymagana` }
            }
            if (q.options.length !== QUIZ_OPTIONS_PER_QUESTION) {
                return { success: false, error: `Pytanie ${i + 1}: wymagane dokładnie ${QUIZ_OPTIONS_PER_QUESTION} opcje` }
            }
            const correctCount = q.options.filter((o) => o.is_correct).length
            if (correctCount !== 1) {
                return { success: false, error: `Pytanie ${i + 1}: zaznacz dokładnie jedną poprawną odpowiedź` }
            }
            for (let j = 0; j < q.options.length; j++) {
                if (!q.options[j].option_text || q.options[j].option_text.trim().length === 0) {
                    return { success: false, error: `Pytanie ${i + 1}, opcja ${j + 1}: treść jest wymagana` }
                }
            }
        }

        const { error } = await supabase.rpc('academy_replace_quiz', { p_course_id: courseId, p_questions: questions })
        assertDatabaseResult(error)

        revalidatePath(`/learning/tworze/${courseId}/edit`)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu quizu'
        logger.error({ event: 'courses.set_quiz_questions.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Wysyła kurs do moderacji: status `draft` lub `rejected` → `pending_review`.
 * Walidacja: ≥1 lekcja + 4-10 pytań quizu (każde z 4 opcjami i 1 correct).
 */
export async function submitForReview(courseId: string): Promise<ActionResult<void>> {
    return academyAction('course.submit', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_submit_for_review', { p_course_id: z.uuid().parse(courseId) })
        assertDatabaseResult(error)
        revalidatePath('/learning/tworze')
        revalidatePath(`/learning/tworze/${courseId}/edit`)
        revalidatePath('/admin/learning')
    })
}

/** Compatibility response for a stale authoring page. All new uploads must be scanned. */
export async function uploadCourseAttachment(_formData: FormData): Promise<ActionResult<CourseAttachment>> {
    return { success: false, error: 'Odśwież edytor i prześlij materiał przez bezpieczny formularz uploadu.' }
}
