'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { withCourseVersion, type CourseVersion } from '@/lib/academy/course-data'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type {
    ActionResult,
    Course,
    CourseEnrollmentWithProgress,
    CourseListItem,
    QuizQuestionForAttempt,
    QuizSubmissionResult,
    RecommendedCourse,
} from '@/lib/types/learning'

// ============================================================
// Server actions — student
// ============================================================

/**
 * Zapisuje konsultanta na kurs. Idempotentne: jeśli zapis już istnieje, zwraca jego ID.
 */
export async function enrollInCourse(courseId: string): Promise<ActionResult<{ enrollmentId: string; alreadyEnrolled: boolean }>> {
    return academyAction('enrollment.create', async () => {
        const { client, access } = await requireAcademyContext()
        const id = z.uuid().parse(courseId)
        const { data: existing, error: existingError } = await client.from('course_enrollments').select('id').eq('user_id', access.userId).eq('course_id', id).is('run_id', null).maybeSingle()
        assertDatabaseResult(existingError)
        const { data, error } = await client.rpc('academy_enroll', { p_course_id: id })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return { enrollmentId: data as string, alreadyEnrolled: !!existing }
    })
}

async function enrollmentContext(courseId: string, enrollmentId?: string) {
    const context = await requireAcademyContext()
    let query = context.client.from('course_enrollments').select('id,version_id,completed_at').eq('course_id', z.uuid().parse(courseId)).eq('user_id', context.access.userId)
    query = enrollmentId ? query.eq('id', z.uuid().parse(enrollmentId)) : query.is('run_id', null)
    const { data, error } = await query.single()
    assertDatabaseResult(error)
    if (!data) throw new Error('Najpierw zapisz się na szkolenie.')
    return { ...context, enrollment: data }
}

export async function markLessonComplete(courseId: string, lessonId: string, enrollmentId?: string): Promise<ActionResult<{ streak: { current: number; milestone_reached: boolean } | null }>> {
    return academyAction('lesson.complete', async () => {
        const { client, enrollment } = await enrollmentContext(courseId, enrollmentId)
        const { data, error } = await client.rpc('academy_mark_lesson_complete', { p_enrollment_id: enrollment.id, p_lesson_id: z.uuid().parse(lessonId) })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return { streak: data?.streak ?? null }
    })
}

export async function recordLessonAccess(courseId: string, lessonId: string, enrollmentId?: string): Promise<ActionResult<void>> {
    return academyAction('lesson.access', async () => {
        const { client, enrollment } = await enrollmentContext(courseId, enrollmentId)
        const { error } = await client.rpc('academy_record_lesson_access', { p_enrollment_id: enrollment.id, p_lesson_id: z.uuid().parse(lessonId) })
        assertDatabaseResult(error)
    })
}

export async function getQuizForAttempt(courseId: string, enrollmentId?: string): Promise<ActionResult<QuizQuestionForAttempt[]>> {
    return academyAction('quiz.get', async () => {
        const { client, enrollment } = await enrollmentContext(courseId, enrollmentId)
        const { data, error } = await client.rpc('academy_get_quiz', { p_enrollment_id: enrollment.id })
        assertDatabaseResult(error)
        return data as QuizQuestionForAttempt[]
    })
}

export async function submitQuizAttempt(courseId: string, answers: { question_id: string; selected_option_id: string }[], enrollmentId?: string): Promise<ActionResult<QuizSubmissionResult>> {
    return academyAction('quiz.submit', async () => {
        const parsed = z.array(z.object({ question_id: z.uuid(), selected_option_id: z.uuid() })).min(1).max(100).parse(answers)
        if (new Set(parsed.map(answer => answer.question_id)).size !== parsed.length) throw new Error('Każde pytanie może mieć tylko jedną odpowiedź.')
        const { client, enrollment } = await enrollmentContext(courseId, enrollmentId)
        const { data, error } = await client.rpc('academy_submit_quiz', { p_enrollment_id: enrollment.id, p_answers: parsed })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return data as QuizSubmissionResult
    })
}

export async function completeAcademyCourse(courseId: string, enrollmentId?: string) {
    return academyAction('course.complete', async () => {
        const { client, enrollment } = await enrollmentContext(courseId, enrollmentId)
        const { data, error } = await client.rpc('academy_complete_course', { p_enrollment_id: enrollment.id })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return data as { completed: boolean; already_completed?: boolean; reason?: string }
    })
}

export async function getMyQuizResult(courseId: string, attemptId: string, enrollmentId?: string) {
    return academyAction('quiz.result', async () => {
        const { client, access, enrollment } = await enrollmentContext(courseId, enrollmentId)
        const { data, error } = await client.from('course_quiz_attempts').select('id,score_percent,passed,attempted_at').eq('id', z.uuid().parse(attemptId)).eq('enrollment_id', enrollment.id).eq('user_id', access.userId).single()
        assertDatabaseResult(error)
        if (!data) throw new Error('Wynik jest niedostępny.')
        const completion = enrollment.completed_at ? await client.from('course_completions').select('revoked_at').eq('enrollment_id', enrollment.id).eq('user_id', access.userId).maybeSingle() : { data: null, error: null }
        assertDatabaseResult(completion.error)
        return { id: data.id as string, score: data.score_percent as number, passed: data.passed as boolean, completed: !!enrollment.completed_at && !completion.data?.revoked_at }
    })
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
            .not('completed_at', 'is', null)
            .limit(1)
            .maybeSingle()
        if (!enrollment?.completed_at) {
            return { success: false, error: 'Możesz ocenić kurs dopiero po spełnieniu wszystkich warunków ukończenia.' }
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

        revalidatePath('/learning')
        if (course?.slug) revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu oceny'
        logCompat.error('[submitRating]', error)
        return { success: false, error: msg }
    }
}

const enrollmentPageOptions = z.object({
    activePage: z.number().int().min(1).max(100_000).default(1),
    completedPage: z.number().int().min(1).max(100_000).default(1),
    revokedPage: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(50).default(24),
})

const enrollmentPageResult = z.object({
    totals: z.object({ active: z.number().int().nonnegative(), completed: z.number().int().nonnegative(), revoked: z.number().int().nonnegative() }),
    items: z.array(z.object({
        enrollment: z.object({
            id: z.uuid(), version_id: z.uuid(), enrolled_at: z.string(),
            completed_lessons: z.array(z.uuid()), completed_at: z.string().nullable(),
            completion_revoked_at: z.string().nullable(), completion_revoked_reason: z.string().nullable(),
            points_awarded: z.boolean(), last_accessed_lesson_id: z.string().nullable(),
            last_accessed_at: z.string().nullable(), run_id: z.string().nullable(),
            section: z.enum(['active', 'completed', 'revoked']),
        }).passthrough(),
        course: z.unknown(), version: z.unknown(), requiredLessonIds: z.array(z.uuid()),
    })),
})

export type MyEnrollmentsPage = {
    items: CourseEnrollmentWithProgress[]
    totals: { active: number; completed: number; revoked: number }
    activePage: number
    completedPage: number
    revokedPage: number
    pageSize: number
}

/** Filter before paging; the overview and its counts must include older history. */
export async function getMyEnrollmentsPage(options: z.input<typeof enrollmentPageOptions> = {}): Promise<ActionResult<MyEnrollmentsPage>> {
    return academyAction('enrollment.mine_page', async () => {
        const { activePage, completedPage, revokedPage, pageSize } = enrollmentPageOptions.parse(options)
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_my_enrollments_page', {
            p_active_page: activePage, p_completed_page: completedPage,
            p_revoked_page: revokedPage, p_limit: pageSize,
        })
        assertDatabaseResult(error)
        const page = enrollmentPageResult.parse(data)
        for (const [section, selectedPage] of [['active', activePage], ['completed', completedPage], ['revoked', revokedPage]] as const) {
            const expected = Math.min(pageSize, Math.max(0, page.totals[section] - (selectedPage - 1) * pageSize))
            if (page.items.filter(item => item.enrollment.section === section).length !== expected) {
                throw new Error('Lista szkoleń jest niepełna. Odśwież stronę.')
            }
        }
        const items = page.items.map(({ enrollment, course, version, requiredLessonIds }) => {
            const completed = new Set(enrollment.completed_lessons)
            const completedLessonIds = requiredLessonIds.filter(id => completed.has(id))
            return {
                enrollment_id: enrollment.id,
                course: withCourseVersion(course as Course, version as CourseVersion),
                enrolled_at: enrollment.enrolled_at,
                completed_lessons: completedLessonIds,
                total_lessons: requiredLessonIds.length,
                completed_at: enrollment.completed_at,
                completion_revoked_at: enrollment.completion_revoked_at,
                completion_revoked_reason: enrollment.completion_revoked_reason,
                points_awarded: enrollment.points_awarded,
                progress_percent: enrollment.completed_at ? 100 : requiredLessonIds.length ? Math.min(99, Math.round(completedLessonIds.length / requiredLessonIds.length * 100)) : 0,
                last_accessed_lesson_id: enrollment.last_accessed_lesson_id,
                last_accessed_at: enrollment.last_accessed_at,
                version_id: enrollment.version_id,
                run_id: enrollment.run_id,
            } satisfies CourseEnrollmentWithProgress
        })
        return { items, totals: page.totals, activePage, completedPage, revokedPage, pageSize }
    })
}

// ============================================================
// AI rekomendacje
// ============================================================

/**
 * Rekomenduje opublikowane kursy konsultantowi na bazie braków w skillach
 * (z istniejącego getSkillGaps w lib/actions/development.ts).
 *
 * Strategia:
 *  1. Weź skill gaps (missingSkills) z analizy projektowej
 *  2. Match kursy z published WHERE tags ∩ missingSkills > 0
 *  3. Sortuj po liczbie pokrywających tagów + ratingu
 *  4. Fallback: gdy brak gapów lub brak matchu, zwróć Top N popularnych kursów
 */
export async function getRecommendedCourses(): Promise<ActionResult<{ items: RecommendedCourse[]; basedOnGaps: boolean }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // Pobierz braki skilli (lazy import — żeby nie tworzyć cyklicznych zależności)
        const { getSkillGaps } = await import('./development')
        const gaps = await getSkillGaps()
        const missingSkills = new Set<string>()
        for (const g of gaps.gaps) {
            if (g.status === 'has_gaps') {
                for (const s of g.missingSkills) missingSkills.add(s.toLowerCase())
            }
        }

        // Pobierz wszystkie published kursy
        const { data: rawCourses, error: coursesErr } = await supabase
            .from('courses')
            .select('*')
            .eq('status', 'published')
            .order('avg_rating', { ascending: false })
        if (coursesErr) throw coursesErr

        const courses = (rawCourses ?? []) as Course[]
        if (courses.length === 0) return { success: true, data: { items: [], basedOnGaps: missingSkills.size > 0 } }

        // Pobierz autorów (do CourseListItem)
        const authorIds = Array.from(new Set(courses.map((c) => c.author_id)))
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', authorIds)
        const authorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) {
            authorMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
        }

        // Wyklucz kursy w które user już jest zapisany (nie polecaj tego, co już ma)
        const { data: enrolls } = await supabase
            .from('course_enrollments')
            .select('course_id')
            .eq('user_id', user.id)
        const enrolledIds = new Set((enrolls ?? []).map((e) => (e as { course_id: string }).course_id))

        const eligible = courses.filter((c) => !enrolledIds.has(c.id) && c.author_id !== user.id)

        const itemize = (c: Course, overlap: number, matchedSkills: string[]): RecommendedCourse => {
            const author = authorMap.get(c.author_id)
            const item: CourseListItem = {
                ...c,
                author_name: author?.full_name ?? null,
                author_avatar_url: author?.avatar_url ?? null,
            }
            const reason = overlap > 0
                ? `Pokrywa Twoje braki: ${matchedSkills.slice(0, 3).join(', ')}${matchedSkills.length > 3 ? '…' : ''}`
                : 'Popularne wśród konsultantów'
            return { course: item, overlap_count: overlap, reason }
        }

        // Tag overlap scoring
        if (missingSkills.size > 0) {
            const scored = eligible
                .map((c) => {
                    const matched = c.tags.filter((t) => missingSkills.has(t.toLowerCase()))
                    return { course: c, matched }
                })
                .filter((x) => x.matched.length > 0)
                .sort((a, b) => {
                    if (a.matched.length !== b.matched.length) return b.matched.length - a.matched.length
                    return b.course.avg_rating - a.course.avg_rating
                })
                .slice(0, 12)

            if (scored.length > 0) {
                return {
                    success: true,
                    data: {
                        items: scored.map((s) => itemize(s.course, s.matched.length, s.matched)),
                        basedOnGaps: true,
                    },
                }
            }
        }

        // Fallback: top by enrollments_count + avg_rating
        const fallback = [...eligible]
            .sort((a, b) => {
                if (b.enrollments_count !== a.enrollments_count) return b.enrollments_count - a.enrollments_count
                return b.avg_rating - a.avg_rating
            })
            .slice(0, 12)

        return {
            success: true,
            data: {
                items: fallback.map((c) => itemize(c, 0, [])),
                basedOnGaps: false,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd rekomendacji'
        logCompat.error('[getRecommendedCourses]', error)
        return { success: false, error: msg }
    }
}
