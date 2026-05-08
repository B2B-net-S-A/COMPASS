'use server'

import { createClient } from '@/lib/supabase/server'
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
            .select('id, status, slug, prerequisite_course_ids')
            .eq('id', courseId)
            .single<{ id: string; status: string; slug: string; prerequisite_course_ids: string[] | null }>()
        if (courseErr || !course) return { success: false, error: 'Kurs nie istnieje lub brak dostępu' }
        if (course.status !== 'published') {
            return { success: false, error: 'Kurs nie jest opublikowany' }
        }

        // A2.2: walidacja prerequisites — user musi mieć completed enrollments w wymaganych kursach
        const prereqs = course.prerequisite_course_ids ?? []
        if (prereqs.length > 0) {
            const { data: completedEnrolls } = await supabase
                .from('course_enrollments')
                .select('course_id')
                .eq('user_id', user.id)
                .in('course_id', prereqs)
                .not('completed_at', 'is', null)
            const completedSet = new Set(
                (completedEnrolls ?? []).map((e) => (e as { course_id: string }).course_id),
            )
            const missing = prereqs.filter((id) => !completedSet.has(id))
            if (missing.length > 0) {
                // Pobierz tytuły brakujących kursów (dla user-friendly error)
                const { data: missingCourses } = await supabase
                    .from('courses')
                    .select('title')
                    .in('id', missing)
                const titles = (missingCourses ?? [])
                    .map((c) => (c as { title: string }).title)
                    .join(', ')
                return {
                    success: false,
                    error: `Brakuje ukończonych kursów wymaganych: ${titles}`,
                }
            }
        }

        const { data, error } = await supabase
            .from('course_enrollments')
            .insert({ user_id: user.id, course_id: courseId })
            .select('id')
            .single()
        if (error) throw error

        revalidatePath('/learning/moje')
        revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: { enrollmentId: data.id, alreadyEnrolled: false } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu na kurs'
        console.error('[enrollInCourse]', error)
        return { success: false, error: msg }
    }
}

/**
 * Oznacza lekcję jako ukończoną (append do `completed_lessons` UUID[] z dedup).
 * Aktualizuje też `last_accessed_lesson_id` + `last_accessed_at` (A1.1)
 * oraz bump streak nauki (A1.4) tylko przy NEW completion (nie idempotent).
 */
export async function markLessonComplete(
    courseId: string,
    lessonId: string,
): Promise<ActionResult<{ streak: { current: number; milestone_reached: boolean } | null }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: enrollment, error: enrErr } = await supabase
            .from('course_enrollments')
            .select('id, completed_lessons, lesson_completion_dates')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single<{
                id: string
                completed_lessons: string[] | null
                lesson_completion_dates: Record<string, string> | null
            }>()
        if (enrErr || !enrollment) return { success: false, error: 'Nie jesteś zapisany na ten kurs' }

        const completed: string[] = Array.isArray(enrollment.completed_lessons) ? enrollment.completed_lessons : []
        const completionDates: Record<string, string> = enrollment.lesson_completion_dates ?? {}
        const nowIso = new Date().toISOString()
        const alreadyMarked = completed.includes(lessonId)

        const updatePayload: {
            completed_lessons?: string[]
            lesson_completion_dates?: Record<string, string>
            last_accessed_lesson_id: string
            last_accessed_at: string
        } = {
            last_accessed_lesson_id: lessonId,
            last_accessed_at: nowIso,
        }
        if (!alreadyMarked) {
            updatePayload.completed_lessons = [...completed, lessonId]
            // A2.4: zapisz timestamp ukończenia dla drip release gating
            updatePayload.lesson_completion_dates = { ...completionDates, [lessonId]: nowIso }
        }

        const { error } = await supabase
            .from('course_enrollments')
            .update(updatePayload)
            .eq('id', enrollment.id)
        if (error) throw error

        // A1.4: bump streak tylko przy NEW completion (re-marking nie liczy się)
        let streakInfo: { current: number; milestone_reached: boolean } | null = null
        if (!alreadyMarked) {
            streakInfo = await bumpLearningStreak(user.id)
        }

        return { success: true, data: { streak: streakInfo } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd oznaczania lekcji'
        console.error('[markLessonComplete]', error)
        return { success: false, error: msg }
    }
}

/**
 * A1.4: Aktualizuje passę nauki (learning_streak_*) w profilu usera.
 * Rules:
 *  - Jeśli last_date == today → no-op (już dziś coś zrobił)
 *  - Jeśli last_date == yesterday → streak++
 *  - Inaczej (gap ≥1 dzień lub null) → reset to 1
 *  - Update longest jeśli current > longest
 *  - Co 7 kolejnych dni (current % 7 == 0): INSERT loyalty_transactions +25 pkt
 *
 * Zwraca current streak + milestone flag (dla UI toast).
 * Jest internal helper — niewystawiony jako server action.
 */
async function bumpLearningStreak(
    userId: string,
): Promise<{ current: number; milestone_reached: boolean }> {
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: profile } = await supabase
        .from('profiles')
        .select('learning_streak_current, learning_streak_longest, learning_streak_last_date')
        .eq('id', userId)
        .single<{
            learning_streak_current: number
            learning_streak_longest: number
            learning_streak_last_date: string | null
        }>()

    if (!profile) {
        return { current: 0, milestone_reached: false }
    }

    if (profile.learning_streak_last_date === today) {
        // Już dziś coś zrobił — no-op, ale zwracamy current dla UI
        return { current: profile.learning_streak_current, milestone_reached: false }
    }

    let newCurrent: number
    if (profile.learning_streak_last_date === yesterday) {
        newCurrent = profile.learning_streak_current + 1
    } else {
        // Gap (>=1 dzień przerwy) lub pierwsza aktywność → reset
        newCurrent = 1
    }
    const newLongest = Math.max(newCurrent, profile.learning_streak_longest)
    const milestoneReached = newCurrent > 0 && newCurrent % 7 === 0

    const { error: updErr } = await supabase
        .from('profiles')
        .update({
            learning_streak_current: newCurrent,
            learning_streak_longest: newLongest,
            learning_streak_last_date: today,
        })
        .eq('id', userId)
    if (updErr) console.error('[bumpLearningStreak] update profile failed:', updErr)

    if (milestoneReached) {
        // INSERT loyalty_transactions +25 pkt za passę 7/14/21/... dni
        const { error: lpErr } = await supabase.from('loyalty_transactions').insert({
            user_id: userId,
            source_type: 'learning_streak_milestone',
            points: 25,
            description: `Passa nauki: ${newCurrent} dni z rzędu`,
        })
        if (lpErr) console.error('[bumpLearningStreak] loyalty insert failed:', lpErr)
    }

    return { current: newCurrent, milestone_reached: milestoneReached }
}

/**
 * A1.1: rejestruje wejście użytkownika do lekcji — aktualizuje
 * `last_accessed_lesson_id` + `last_accessed_at` w course_enrollments.
 * Idempotent: cicho ignoruje gdy user nie jest zapisany albo brak auth.
 *
 * Wywoływane z lesson page (server-side) za każdym renderem strony lekcji.
 * Kontynuacja: na home page widget "Wróć do nauki" wskazuje ostatnio
 * odwiedzoną lekcję (najwyższy last_accessed_at z aktywnych enrollments).
 */
export async function recordLessonAccess(courseId: string, lessonId: string): Promise<ActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: true, data: undefined } // silent no-op

        const { error } = await supabase
            .from('course_enrollments')
            .update({
                last_accessed_lesson_id: lessonId,
                last_accessed_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('course_id', courseId)
        if (error) throw error

        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd rejestracji wejścia'
        console.error('[recordLessonAccess]', error)
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

        revalidatePath('/learning/moje')
        revalidatePath('/league')
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

        revalidatePath('/learning')
        if (course?.slug) revalidatePath(`/learning/${course.slug}`)
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
            .select('id, course_id, enrolled_at, completed_lessons, completed_at, points_awarded, last_accessed_lesson_id, last_accessed_at')
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
            last_accessed_lesson_id: string | null
            last_accessed_at: string | null
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
                    last_accessed_lesson_id: e.last_accessed_lesson_id,
                    last_accessed_at: e.last_accessed_at,
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
        console.error('[getRecommendedCourses]', error)
        return { success: false, error: msg }
    }
}
