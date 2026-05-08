'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
    ActionResult,
    Course,
    LearningPath,
    LearningPathDetail,
    LearningPathListItem,
} from '@/lib/types/learning'

// ============================================================
// A2.1 — Learning Paths server actions
// ============================================================

/**
 * Lista opublikowanych ścieżek (z liczbą kursów + progress jeśli user zapisany).
 */
export async function listLearningPaths(): Promise<ActionResult<LearningPathListItem[]>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        const { data: paths, error } = await supabase
            .from('learning_paths')
            .select('*')
            .eq('status', 'published')
            .order('created_at', { ascending: false })
        if (error) throw error

        const pathsTyped = (paths ?? []) as LearningPath[]
        if (pathsTyped.length === 0) return { success: true, data: [] }

        const pathIds = pathsTyped.map((p) => p.id)

        // Pull liczby kursów per path
        const { data: pathCourses } = await supabase
            .from('learning_path_courses')
            .select('path_id')
            .in('path_id', pathIds)
        const courseCountMap = new Map<string, number>()
        for (const pc of (pathCourses ?? []) as Array<{ path_id: string }>) {
            courseCountMap.set(pc.path_id, (courseCountMap.get(pc.path_id) ?? 0) + 1)
        }

        // Pull user enrollments + per-path progress jeśli user zalogowany
        const enrollmentMap = new Map<string, { progress: number; isEnrolled: boolean }>()
        if (user) {
            const { data: enrolls } = await supabase
                .from('learning_path_enrollments')
                .select('path_id, completed_at')
                .eq('user_id', user.id)
                .in('path_id', pathIds)

            const enrolledArr = Array.from(
                new Set(((enrolls ?? []) as Array<{ path_id: string }>).map((e) => e.path_id)),
            )
            for (const id of enrolledArr) {
                enrollmentMap.set(id, { progress: 0, isEnrolled: true })
            }

            // Compute progress: per-path = (ukończone kursy / total kursy w path)
            if (enrolledArr.length > 0) {
                const { data: pathCoursesAll } = await supabase
                    .from('learning_path_courses')
                    .select('path_id, course_id')
                    .in('path_id', enrolledArr)
                type PCRow = { path_id: string; course_id: string }
                const allCourseIds = (pathCoursesAll ?? []).map((r: PCRow) => r.course_id)

                if (allCourseIds.length > 0) {
                    const { data: completedEnrolls } = await supabase
                        .from('course_enrollments')
                        .select('course_id')
                        .eq('user_id', user.id)
                        .in('course_id', allCourseIds)
                        .not('completed_at', 'is', null)
                    const completedSet = new Set(
                        ((completedEnrolls ?? []) as Array<{ course_id: string }>).map((c) => c.course_id),
                    )

                    // Re-aggregate per path
                    const pathTotals = new Map<string, { total: number; done: number }>()
                    for (const r of (pathCoursesAll ?? []) as PCRow[]) {
                        const cur = pathTotals.get(r.path_id) ?? { total: 0, done: 0 }
                        cur.total += 1
                        if (completedSet.has(r.course_id)) cur.done += 1
                        pathTotals.set(r.path_id, cur)
                    }
                    pathTotals.forEach((t, pid) => {
                        const progress = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0
                        enrollmentMap.set(pid, { progress, isEnrolled: true })
                    })
                }
            }
        }

        const items: LearningPathListItem[] = pathsTyped.map((p) => {
            const enr = enrollmentMap.get(p.id)
            return {
                ...p,
                course_count: courseCountMap.get(p.id) ?? 0,
                is_enrolled: enr?.isEnrolled ?? false,
                progress_percent: enr?.progress ?? 0,
            }
        })

        return { success: true, data: items }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania ścieżek'
        console.error('[listLearningPaths]', error)
        return { success: false, error: msg }
    }
}

/**
 * Detail ścieżki — pełne dane + lista kursów w kolejności + per-course progress.
 */
export async function getLearningPathDetail(slug: string): Promise<ActionResult<LearningPathDetail>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        const { data: path, error: pathErr } = await supabase
            .from('learning_paths')
            .select('*')
            .eq('slug', slug)
            .single<LearningPath>()
        if (pathErr || !path) return { success: false, error: 'Ścieżka nie istnieje' }

        // Pull courses w order
        const { data: pathCourses } = await supabase
            .from('learning_path_courses')
            .select('course_id, order_index, is_required')
            .eq('path_id', path.id)
            .order('order_index')
        const links = (pathCourses ?? []) as Array<{
            course_id: string
            order_index: number
            is_required: boolean
        }>

        // Pull course details
        const courseIds = links.map((l) => l.course_id)
        const { data: coursesData } =
            courseIds.length > 0
                ? await supabase.from('courses').select('*').in('id', courseIds)
                : { data: [] }
        const courseMap = new Map<string, Course>()
        for (const c of (coursesData ?? []) as Course[]) courseMap.set(c.id, c)

        // User enrollment status w path + per-course progress
        let isEnrolledInPath = false
        let pathCompletedAt: string | null = null
        const completedCourses = new Set<string>()
        const enrolledInCourses = new Set<string>()

        if (user) {
            const { data: pathEnr } = await supabase
                .from('learning_path_enrollments')
                .select('completed_at')
                .eq('user_id', user.id)
                .eq('path_id', path.id)
                .maybeSingle<{ completed_at: string | null }>()
            isEnrolledInPath = !!pathEnr
            pathCompletedAt = pathEnr?.completed_at ?? null

            if (courseIds.length > 0) {
                const { data: courseEnrolls } = await supabase
                    .from('course_enrollments')
                    .select('course_id, completed_at')
                    .eq('user_id', user.id)
                    .in('course_id', courseIds)
                for (const ce of (courseEnrolls ?? []) as Array<{
                    course_id: string
                    completed_at: string | null
                }>) {
                    enrolledInCourses.add(ce.course_id)
                    if (ce.completed_at) completedCourses.add(ce.course_id)
                }
            }
        }

        const courses = links
            .map((l) => {
                const course = courseMap.get(l.course_id)
                if (!course) return null
                return {
                    course,
                    order_index: l.order_index,
                    is_required: l.is_required,
                    is_completed: completedCourses.has(l.course_id),
                    is_enrolled: enrolledInCourses.has(l.course_id),
                }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)

        const total = courses.length
        const done = courses.filter((c) => c.is_completed).length
        const progress = total > 0 ? Math.round((done / total) * 100) : 0

        return {
            success: true,
            data: {
                ...path,
                courses,
                is_enrolled_in_path: isEnrolledInPath,
                completed_courses_count: done,
                total_courses_count: total,
                progress_percent: progress,
                completed_at: pathCompletedAt,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania ścieżki'
        console.error('[getLearningPathDetail]', error)
        return { success: false, error: msg }
    }
}

/**
 * Zapisz na ścieżkę (idempotent).
 */
export async function enrollInLearningPath(pathId: string): Promise<ActionResult<{ enrollmentId: string }>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: existing } = await supabase
            .from('learning_path_enrollments')
            .select('id')
            .eq('user_id', user.id)
            .eq('path_id', pathId)
            .maybeSingle()
        if (existing) {
            return { success: true, data: { enrollmentId: (existing as { id: string }).id } }
        }

        const { data, error } = await supabase
            .from('learning_path_enrollments')
            .insert({ user_id: user.id, path_id: pathId })
            .select('id')
            .single()
        if (error) throw error

        revalidatePath('/learning')
        revalidatePath('/learning/paths')
        return { success: true, data: { enrollmentId: (data as { id: string }).id } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu na ścieżkę'
        console.error('[enrollInLearningPath]', error)
        return { success: false, error: msg }
    }
}

/**
 * Sprawdź czy user ukończył ścieżkę (wszystkie required kursy = completed).
 * Wywoływane np. po quiz pass jako "post-completion check".
 * Idempotent: gdy już marked completed, no-op.
 */
export async function checkLearningPathCompletion(
    pathId: string,
): Promise<ActionResult<{ now_completed: boolean }>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: enr } = await supabase
            .from('learning_path_enrollments')
            .select('id, completed_at')
            .eq('user_id', user.id)
            .eq('path_id', pathId)
            .maybeSingle<{ id: string; completed_at: string | null }>()
        if (!enr) return { success: true, data: { now_completed: false } }
        if (enr.completed_at) return { success: true, data: { now_completed: false } }

        const { data: required } = await supabase
            .from('learning_path_courses')
            .select('course_id')
            .eq('path_id', pathId)
            .eq('is_required', true)
        const requiredIds = ((required ?? []) as Array<{ course_id: string }>).map((r) => r.course_id)
        if (requiredIds.length === 0) return { success: true, data: { now_completed: false } }

        const { data: completed } = await supabase
            .from('course_enrollments')
            .select('course_id')
            .eq('user_id', user.id)
            .in('course_id', requiredIds)
            .not('completed_at', 'is', null)
        const completedSet = new Set(
            ((completed ?? []) as Array<{ course_id: string }>).map((c) => c.course_id),
        )
        const allDone = requiredIds.every((id) => completedSet.has(id))

        if (allDone) {
            await supabase
                .from('learning_path_enrollments')
                .update({ completed_at: new Date().toISOString() })
                .eq('id', enr.id)
            return { success: true, data: { now_completed: true } }
        }
        return { success: true, data: { now_completed: false } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd weryfikacji'
        console.error('[checkLearningPathCompletion]', error)
        return { success: false, error: msg }
    }
}
