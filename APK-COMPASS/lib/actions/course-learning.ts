'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Course } from './courses'

// ============================================================
// Types
// ============================================================

export interface QuizQuestionForAttempt {
    question_id: string
    question_order: number
    question_text: string
    options: { id: string; order_index: number; option_text: string }[]
}

export interface QuizSubmissionResult {
    score_percent: number
    passed: boolean
    attempt_id: string
    already_awarded: boolean
    award_status: string | null
}

export interface CourseEnrollmentWithProgress {
    enrollment_id: string
    course: Course
    enrolled_at: string
    completed_lessons: string[]
    total_lessons: number
    completed_at: string | null
    points_awarded: boolean
    progress_percent: number
}

// ============================================================
// Server actions — student
// ============================================================

/**
 * Zapisuje konsultanta na kurs. Idempotentne: jeśli zapis już istnieje, zwraca jego ID.
 */
export async function enrollInCourse(courseId: string): Promise<ActionResult<{ enrollmentId: string; alreadyEnrolled: boolean }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // Idempotency check
        const { data: existing } = await supabase
            .from('course_enrollments')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .maybeSingle()
        if (existing) {
            return { success: true, data: { enrollmentId: existing.id, alreadyEnrolled: true } }
        }

        // Verify course is published (RLS will reject otherwise)
        const { data: course, error: courseErr } = await supabase
            .from('courses')
            .select('id, status, slug')
            .eq('id', courseId)
            .single()
        if (courseErr || !course) return { success: false, error: 'Kurs nie istnieje lub brak dostępu' }
        if (course.status !== 'published') {
            return { success: false, error: 'Kurs nie jest opublikowany' }
        }

        const { data, error } = await supabase
            .from('course_enrollments')
            .insert({ user_id: user.id, course_id: courseId })
            .select('id')
            .single()
        if (error) throw error

        revalidatePath('/akademia/moje')
        revalidatePath(`/akademia/${course.slug}`)
        return { success: true, data: { enrollmentId: data.id, alreadyEnrolled: false } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu na kurs'
        console.error('[enrollInCourse]', error)
        return { success: false, error: msg }
    }
}

/**
 * Oznacza lekcję jako ukończoną (append do `completed_lessons` UUID[] z dedup).
 */
export async function markLessonComplete(courseId: string, lessonId: string): Promise<ActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: enrollment, error: enrErr } = await supabase
            .from('course_enrollments')
            .select('id, completed_lessons')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single()
        if (enrErr || !enrollment) return { success: false, error: 'Nie jesteś zapisany na ten kurs' }

        const completed: string[] = Array.isArray(enrollment.completed_lessons) ? enrollment.completed_lessons : []
        if (completed.includes(lessonId)) {
            return { success: true, data: undefined } // already marked
        }

        const { error } = await supabase
            .from('course_enrollments')
            .update({ completed_lessons: [...completed, lessonId] })
            .eq('id', enrollment.id)
        if (error) throw error

        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd oznaczania lekcji'
        console.error('[markLessonComplete]', error)
        return { success: false, error: msg }
    }
}

/**
 * Pobiera quiz dla studenta (bez `is_correct`) przez RPC `get_quiz_for_attempt`.
 * RPC sprawdza enrollment / autora / admina.
 */
export async function getQuizForAttempt(courseId: string): Promise<ActionResult<QuizQuestionForAttempt[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase.rpc('get_quiz_for_attempt', { p_course_id: courseId })
        if (error) throw error

        const questions = ((data ?? []) as Array<{
            question_id: string
            question_order: number
            question_text: string
            options: { id: string; order_index: number; option_text: string }[] | null
        }>).map((q) => ({
            question_id: q.question_id,
            question_order: q.question_order,
            question_text: q.question_text,
            options: Array.isArray(q.options) ? q.options : [],
        }))

        return { success: true, data: questions }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania quizu'
        console.error('[getQuizForAttempt]', error)
        return { success: false, error: msg }
    }
}

/**
 * Wysyła odpowiedzi quizu — atomic scoring + INSERT attempt + (jeśli passed) award_course_points.
 * Realizowane przez RPC `submit_quiz_attempt`.
 *
 * @param answers Array of { question_id, selected_option_id }
 */
export async function submitQuizAttempt(
    courseId: string,
    answers: { question_id: string; selected_option_id: string }[],
): Promise<ActionResult<QuizSubmissionResult>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase.rpc('submit_quiz_attempt', {
            p_course_id: courseId,
            p_answers: answers,
        })
        if (error) throw error

        const result = data as QuizSubmissionResult

        revalidatePath('/akademia/moje')
        revalidatePath('/loyalty')
        return { success: true, data: result }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu odpowiedzi quizu'
        console.error('[submitQuizAttempt]', error)
        return { success: false, error: msg }
    }
}

/**
 * Wystawia ocenę kursowi (1–5 + opcjonalny komentarz). Wymaga ukończenia
 * (enrollment.completed_at IS NOT NULL).
 */
export async function submitRating(
    courseId: string,
    rating: number,
    comment?: string,
): Promise<ActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
            return { success: false, error: 'Ocena musi być liczbą od 1 do 5' }
        }

        const { data: enrollment } = await supabase
            .from('course_enrollments')
            .select('completed_at')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single()
        if (!enrollment?.completed_at) {
            return { success: false, error: 'Możesz ocenić kurs dopiero po ukończeniu (zdaniu quizu)' }
        }

        const { data: course } = await supabase
            .from('courses')
            .select('slug')
            .eq('id', courseId)
            .single()

        // Upsert (UNIQUE(user_id, course_id))
        const { data: existing } = await supabase
            .from('course_ratings')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .maybeSingle()

        if (existing) {
            const { error } = await supabase
                .from('course_ratings')
                .update({ rating, comment: comment?.trim() || null })
                .eq('id', existing.id)
            if (error) throw error
        } else {
            const { error } = await supabase
                .from('course_ratings')
                .insert({ user_id: user.id, course_id: courseId, rating, comment: comment?.trim() || null })
            if (error) throw error
        }

        revalidatePath('/akademia')
        if (course?.slug) revalidatePath(`/akademia/${course.slug}`)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu oceny'
        console.error('[submitRating]', error)
        return { success: false, error: msg }
    }
}

/**
 * Pobiera kursy, na które user się zapisał — z postępem (% ukończonych lekcji).
 */
export async function getMyEnrollments(): Promise<ActionResult<CourseEnrollmentWithProgress[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: enrollments, error } = await supabase
            .from('course_enrollments')
            .select('id, course_id, enrolled_at, completed_lessons, completed_at, points_awarded')
            .eq('user_id', user.id)
            .order('enrolled_at', { ascending: false })
        if (error) throw error

        const enrolls = (enrollments ?? []) as Array<{
            id: string
            course_id: string
            enrolled_at: string
            completed_lessons: string[] | null
            completed_at: string | null
            points_awarded: boolean
        }>
        if (enrolls.length === 0) return { success: true, data: [] }

        const courseIds = enrolls.map((e) => e.course_id)
        const { data: courses } = await supabase.from('courses').select('*').in('id', courseIds)
        const coursesMap = new Map<string, Course>()
        for (const c of (courses ?? []) as Course[]) coursesMap.set(c.id, c)

        // Total lessons per course
        const { data: lessonCounts } = await supabase
            .from('course_lessons')
            .select('course_id')
            .in('course_id', courseIds)
        const lessonCountMap = new Map<string, number>()
        for (const l of (lessonCounts ?? []) as Array<{ course_id: string }>) {
            lessonCountMap.set(l.course_id, (lessonCountMap.get(l.course_id) ?? 0) + 1)
        }

        const result: CourseEnrollmentWithProgress[] = enrolls
            .map((e) => {
                const course = coursesMap.get(e.course_id)
                if (!course) return null
                const totalLessons = lessonCountMap.get(e.course_id) ?? 0
                const doneCount = (e.completed_lessons ?? []).length
                const progress = totalLessons === 0 ? (e.completed_at ? 100 : 0) : Math.min(100, Math.round((doneCount / totalLessons) * 100))
                return {
                    enrollment_id: e.id,
                    course,
                    enrolled_at: e.enrolled_at,
                    completed_lessons: e.completed_lessons ?? [],
                    total_lessons: totalLessons,
                    completed_at: e.completed_at,
                    points_awarded: e.points_awarded,
                    progress_percent: progress,
                }
            })
            .filter((x): x is CourseEnrollmentWithProgress => x !== null)

        return { success: true, data: result }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania zapisów'
        console.error('[getMyEnrollments]', error)
        return { success: false, error: msg }
    }
}
