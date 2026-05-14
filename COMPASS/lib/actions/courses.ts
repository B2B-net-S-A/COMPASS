'use server'

import { createClient } from '@/lib/supabase/server'
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
    type CourseStatus,
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
const SLUG_RANDOM_SUFFIX_LENGTH = 6

function slugifyTitle(title: string): string {
    const polishMap: Record<string, string> = {
        ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
        Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
    }
    const normalized = title
        .split('')
        .map((c) => polishMap[c] ?? c)
        .join('')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80)
    return normalized || 'kurs'
}

function randomSuffix(length = SLUG_RANDOM_SUFFIX_LENGTH): string {
    return Math.random().toString(36).slice(2, 2 + length)
}

async function isAdminOrCentrala(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
    const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
    const role = data?.role || ''
    return ['admin'].includes(role)
}

// ============================================================
// Server Actions — author + catalog
// ============================================================

/**
 * Tworzy nowy kurs (status = draft). Każdy authenticated może utworzyć — autorem
 * staje się aktualny user. Slug generowany ze zsanityzowanego tytułu + losowy sufiks.
 */
export async function createCourse(input: CreateCourseInput): Promise<ActionResult<{ courseId: string; slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        if (!input.title || input.title.trim().length < 3) {
            return { success: false, error: 'Tytuł musi mieć co najmniej 3 znaki' }
        }
        if (!input.category || input.category.trim().length === 0) {
            return { success: false, error: 'Kategoria jest wymagana' }
        }

        // Slug: zsanityzowany tytuł + losowy sufiks (zawsze unikalny — bez kolizji)
        const slug = `${slugifyTitle(input.title)}-${randomSuffix()}`

        // Phase 1.4 (2026-05-04): only admin/trainer can pick course_type='company' or is_official=true.
        // Consultant requests for 'company' are silently downgraded to 'consultant' (no error — defensive).
        const callerIsAdminOrTrainer = await isAdminOrCentrala(supabase, user.id)
        const requestedType = input.course_type ?? 'consultant'
        const finalType = callerIsAdminOrTrainer && requestedType === 'company' ? 'company' : 'consultant'
        const finalOfficial = callerIsAdminOrTrainer && finalType === 'company' ? !!input.is_official : false

        const { data, error } = await supabase
            .from('courses')
            .insert({
                author_id: user.id,
                title: input.title.trim(),
                slug,
                description: input.description?.trim() || null,
                category: input.category.trim(),
                tags: input.tags ?? [],
                level: input.level ?? 'beginner',
                duration_minutes: input.duration_minutes ?? null,
                status: 'draft',
                course_type: finalType,
                is_official: finalOfficial,
            })
            .select('id, slug')
            .single()

        if (error) throw error

        revalidatePath('/learning')
        revalidatePath('/learning/tworze')
        return { success: true, data: { courseId: data.id, slug: data.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd tworzenia kursu'
        logger.error({ event: 'courses.create.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Aktualizuje metadane kursu. Tylko autor (lub admin/centrala) może edytować.
 * Kurs w stanie `published` można edytować bez re-submit (do dyskusji w fazie 2).
 */
export async function updateCourse(courseId: string, patch: UpdateCoursePatch): Promise<ActionResult<{ slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: course, error: fetchError } = await supabase
            .from('courses')
            .select('id, author_id, slug, status')
            .eq('id', courseId)
            .single()
        if (fetchError || !course) return { success: false, error: 'Kurs nie istnieje' }

        const isAdmin = await isAdminOrCentrala(supabase, user.id)
        if (course.author_id !== user.id && !isAdmin) {
            return { success: false, error: 'Brak uprawnień do edycji tego kursu' }
        }

        const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (patch.title !== undefined) {
            if (patch.title.trim().length < 3) return { success: false, error: 'Tytuł musi mieć co najmniej 3 znaki' }
            cleanPatch.title = patch.title.trim()
        }
        if (patch.description !== undefined) cleanPatch.description = patch.description?.trim() || null
        if (patch.category !== undefined) {
            if (!patch.category.trim()) return { success: false, error: 'Kategoria nie może być pusta' }
            cleanPatch.category = patch.category.trim()
        }
        if (patch.tags !== undefined) cleanPatch.tags = patch.tags
        if (patch.level !== undefined) cleanPatch.level = patch.level
        if (patch.duration_minutes !== undefined) cleanPatch.duration_minutes = patch.duration_minutes
        if (patch.cover_image_url !== undefined) cleanPatch.cover_image_url = patch.cover_image_url

        const { error: updateError } = await supabase
            .from('courses')
            .update(cleanPatch)
            .eq('id', courseId)

        if (updateError) throw updateError

        revalidatePath('/learning')
        revalidatePath('/learning/tworze')
        revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: { slug: course.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd aktualizacji kursu'
        logger.error({ event: 'courses.update.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Lista kursów aktualnego usera w roli autora (wszystkie statusy).
 */
export async function getMyCourses(): Promise<ActionResult<Course[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .eq('author_id', user.id)
            .order('updated_at', { ascending: false })

        if (error) throw error
        return { success: true, data: (data ?? []) as Course[] }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania kursów'
        logger.error({ event: 'courses.get_my.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Katalog opublikowanych kursów. Filtry: kategoria, tag, poziom, search po tytule/opisie.
 * Sortowanie: newest (published_at desc), popular (enrollments_count desc), top_rated (avg_rating desc).
 */
export async function listPublishedCourses(filters: ListCoursesFilters = {}): Promise<ActionResult<{ items: CourseListItem[]; total: number }>> {
    try {
        const supabase = createClient()
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

        if (filters.category) query = query.eq('category', filters.category)
        if (filters.level) query = query.eq('level', filters.level)
        if (filters.course_type) query = query.eq('course_type', filters.course_type)
        if (filters.tag) query = query.contains('tags', [filters.tag])
        if (filters.search && filters.search.trim().length > 0) {
            const s = `%${filters.search.trim()}%`
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

        query = query.range(from, to)

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
export async function getCourseDetail(slugOrId: string): Promise<ActionResult<CourseDetail>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
        const filterField = isUuid ? 'id' : 'slug'

        const { data: courseRow, error: courseErr } = await supabase
            .from('courses')
            .select('*')
            .eq(filterField, slugOrId)
            .single()

        if (courseErr || !courseRow) return { success: false, error: 'Kurs nie istnieje lub brak dostępu' }

        const course = courseRow as Course

        // Author profile in a separate query (no embed → testable)
        const { data: authorProfile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', course.author_id)
            .maybeSingle()

        const { data: lessons, error: lessonsErr } = await supabase
            .from('course_lessons')
            .select('*')
            .eq('course_id', course.id)
            .order('order_index', { ascending: true })
        if (lessonsErr) throw lessonsErr

        const { count: quizCount, error: quizCountErr } = await supabase
            .from('course_quiz_questions')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', course.id)
        if (quizCountErr) throw quizCountErr

        const { data: enrollment } = await supabase
            .from('course_enrollments')
            .select('id')
            .eq('course_id', course.id)
            .eq('user_id', user.id)
            .maybeSingle()

        const { data: ratingRow } = await supabase
            .from('course_ratings')
            .select('rating, comment')
            .eq('course_id', course.id)
            .eq('user_id', user.id)
            .maybeSingle()

        const detail: CourseDetail = {
            ...course,
            author_name: (authorProfile as { full_name?: string } | null)?.full_name ?? null,
            author_avatar_url: (authorProfile as { avatar_url?: string } | null)?.avatar_url ?? null,
            lessons: ((lessons ?? []) as CourseLesson[]).map((l) => ({
                ...l,
                attachments: Array.isArray(l.attachments) ? l.attachments : [],
            })),
            quiz_questions_count: quizCount ?? 0,
            is_enrolled: !!enrollment,
            user_rating: ratingRow ? { rating: ratingRow.rating, comment: ratingRow.comment } : null,
        }

        return { success: true, data: detail }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania szczegółów kursu'
        logger.error({ event: 'courses.get_detail.failed', error })
        return { success: false, error: msg }
    }
}

// ============================================================
// Authoring helpers — author/admin only
// ============================================================

async function loadCourseForAuthor(
    supabase: ReturnType<typeof createClient>,
    courseId: string,
    userId: string,
): Promise<{ id: string; author_id: string; status: CourseStatus; slug: string } | null> {
    const { data, error } = await supabase
        .from('courses')
        .select('id, author_id, status, slug')
        .eq('id', courseId)
        .single()
    if (error || !data) return null
    const isAdmin = await isAdminOrCentrala(supabase, userId)
    if (data.author_id !== userId && !isAdmin) return null
    return data as { id: string; author_id: string; status: CourseStatus; slug: string }
}

/**
 * Pobiera lekcje kursu (uporządkowane). Zwraca załączniki sparsowane do tablicy.
 * Author/admin widzi wszystkie statusy; student tylko gdy course.status='published' (przez RLS).
 */
export async function getCourseLessons(courseId: string): Promise<ActionResult<CourseLesson[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('course_lessons')
            .select('*')
            .eq('course_id', courseId)
            .order('order_index', { ascending: true })

        if (error) throw error
        const lessons = ((data ?? []) as CourseLesson[]).map((l) => ({
            ...l,
            attachments: Array.isArray(l.attachments) ? l.attachments : [],
        }))
        return { success: true, data: lessons }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania lekcji'
        logger.error({ event: 'courses.get_lessons.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Tworzy nową lekcję na końcu listy (next order_index). Author/admin only.
 */
export async function addLesson(courseId: string, input: CreateLessonInput): Promise<ActionResult<{ lessonId: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień lub kurs nie istnieje' }

        if (!input.title || input.title.trim().length < 2) {
            return { success: false, error: 'Tytuł lekcji jest wymagany' }
        }

        // Determine next order_index
        const { data: existing } = await supabase
            .from('course_lessons')
            .select('order_index')
            .eq('course_id', courseId)
            .order('order_index', { ascending: false })
            .limit(1)
        const nextIndex = existing && existing.length > 0 ? (existing[0] as { order_index: number }).order_index + 1 : 0

        const { data, error } = await supabase
            .from('course_lessons')
            .insert({
                course_id: courseId,
                order_index: nextIndex,
                title: input.title.trim(),
                content_md: input.content_md?.trim() || null,
                video_url: input.video_url?.trim() || null,
                estimated_minutes: input.estimated_minutes ?? null,
                attachments: input.attachments ?? [],
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
        const supabase = createClient()
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
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień lub kurs nie istnieje' }

        // Phase 1: bump every lesson by 1000 to avoid UNIQUE collision
        for (let i = 0; i < orderedIds.length; i++) {
            const { error } = await supabase
                .from('course_lessons')
                .update({ order_index: 1000 + i })
                .eq('id', orderedIds[i])
                .eq('course_id', courseId)
            if (error) throw error
        }
        // Phase 2: set final indices
        for (let i = 0; i < orderedIds.length; i++) {
            const { error } = await supabase
                .from('course_lessons')
                .update({ order_index: i })
                .eq('id', orderedIds[i])
                .eq('course_id', courseId)
            if (error) throw error
        }

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
        const supabase = createClient()
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
export async function getCourseQuizForAuthor(courseId: string): Promise<ActionResult<CourseQuizQuestionAuthor[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień' }

        const { data: questions, error: qErr } = await supabase
            .from('course_quiz_questions')
            .select('id, order_index, question_text')
            .eq('course_id', courseId)
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
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień lub kurs nie istnieje' }

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

        // Delete existing quiz
        const { error: deleteErr } = await supabase
            .from('course_quiz_questions')
            .delete()
            .eq('course_id', courseId)
        if (deleteErr) throw deleteErr

        // Insert new questions + options
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i]
            const { data: insertedQ, error: qErr } = await supabase
                .from('course_quiz_questions')
                .insert({
                    course_id: courseId,
                    order_index: i,
                    question_text: q.question_text.trim(),
                })
                .select('id')
                .single()
            if (qErr) throw qErr

            const optionRows = q.options.map((o, j) => ({
                question_id: insertedQ.id,
                order_index: j,
                option_text: o.option_text.trim(),
                is_correct: o.is_correct,
            }))
            const { error: oErr } = await supabase.from('course_quiz_options').insert(optionRows)
            if (oErr) throw oErr
        }

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
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień lub kurs nie istnieje' }

        if (course.status !== 'draft' && course.status !== 'rejected') {
            return { success: false, error: `Nie można wysłać do moderacji — aktualny status: ${course.status}` }
        }

        const { count: lessonCount, error: lessonErr } = await supabase
            .from('course_lessons')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', courseId)
        if (lessonErr) throw lessonErr
        if ((lessonCount ?? 0) < 1) {
            return { success: false, error: 'Kurs musi mieć co najmniej jedną lekcję' }
        }

        const { count: quizCount, error: quizErr } = await supabase
            .from('course_quiz_questions')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', courseId)
        if (quizErr) throw quizErr
        if ((quizCount ?? 0) < QUIZ_MIN_QUESTIONS) {
            return { success: false, error: `Quiz musi mieć co najmniej ${QUIZ_MIN_QUESTIONS} pytań (jest ${quizCount ?? 0})` }
        }

        const { error: updErr } = await supabase
            .from('courses')
            .update({ status: 'pending_review', rejection_reason: null, updated_at: new Date().toISOString() })
            .eq('id', courseId)
        if (updErr) throw updErr

        revalidatePath(`/learning/tworze`)
        revalidatePath(`/learning/tworze/${courseId}/edit`)
        revalidatePath('/admin/learning')
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd wysyłania do moderacji'
        logger.error({ event: 'courses.submit_for_review.failed', error })
        return { success: false, error: msg }
    }
}

/**
 * Upload załącznika PDF do bucketu `documents` pod ścieżkę `courses/{courseId}/{ts}_{filename}`.
 * Zwraca relatywną ścieżkę storage — zapis do `course_lessons.attachments` po stronie wywołującego.
 */
export async function uploadCourseAttachment(formData: FormData): Promise<ActionResult<CourseAttachment>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const courseId = formData.get('courseId') as string | null
        const file = formData.get('file') as File | null
        if (!courseId || !file) return { success: false, error: 'Brak courseId lub pliku' }

        const course = await loadCourseForAuthor(supabase, courseId, user.id)
        if (!course) return { success: false, error: 'Brak uprawnień' }

        const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
        if (file.size > MAX_BYTES) return { success: false, error: 'Plik przekracza 10 MB' }

        const ALLOWED = ['application/pdf']
        if (!ALLOWED.includes(file.type)) return { success: false, error: 'Dozwolone tylko pliki PDF' }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
        const path = `courses/${courseId}/${Date.now()}_${safeName}`

        const buffer = await file.arrayBuffer()
        const { error: uploadErr } = await supabase.storage
            .from('documents')
            .upload(path, buffer, { contentType: file.type, upsert: false })
        if (uploadErr) throw uploadErr

        const attachment: CourseAttachment = {
            name: file.name,
            storage_path: path,
            size_bytes: file.size,
        }
        return { success: true, data: attachment }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd uploadu pliku'
        logger.error({ event: 'courses.upload_attachment.failed', error })
        return { success: false, error: msg }
    }
}
