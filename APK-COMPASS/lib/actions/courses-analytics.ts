'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'

// ============================================================
// Phase A2.7 / A3.4 — Course Analytics
// Author analytics: per-author summary + per-course breakdown
// Admin analytics: global LMS metrics
// ============================================================

export interface AuthorCourseStat {
    course_id: string
    course_title: string
    course_status: string
    enrollments_count: number
    completions_count: number
    completion_rate: number // %
    avg_rating: number
    ratings_count: number
    last_enrolled_at: string | null
}

export interface AuthorAnalyticsSummary {
    total_courses: number
    total_enrollments: number
    total_completions: number
    average_rating: number // weighted by ratings_count
    courses: AuthorCourseStat[]
}

/**
 * A2.7: per-author dashboard analytics. Tylko własne kursy autora (RLS).
 */
export async function getAuthorAnalytics(): Promise<{
    success: boolean
    data?: AuthorAnalyticsSummary
    error?: string
}> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // Pull author's courses + statystyki rollup
        const { data: courses, error } = await supabase
            .from('courses')
            .select(
                'id, title, status, enrollments_count, completions_count, avg_rating, ratings_count',
            )
            .eq('author_id', user.id)
            .order('enrollments_count', { ascending: false })
        if (error) throw error

        const rows = (courses ?? []) as Array<{
            id: string
            title: string
            status: string
            enrollments_count: number
            completions_count: number
            avg_rating: number
            ratings_count: number
        }>

        // Pobierz last_enrolled_at per course (jeśli courses.length > 0)
        const lastEnrolledMap = new Map<string, string | null>()
        if (rows.length > 0) {
            const { data: lastEnrolls } = await supabase
                .from('course_enrollments')
                .select('course_id, enrolled_at')
                .in(
                    'course_id',
                    rows.map((r) => r.id),
                )
                .order('enrolled_at', { ascending: false })
                .limit(rows.length * 5) // sufficient buffer
            for (const e of (lastEnrolls ?? []) as Array<{ course_id: string; enrolled_at: string }>) {
                if (!lastEnrolledMap.has(e.course_id)) {
                    lastEnrolledMap.set(e.course_id, e.enrolled_at)
                }
            }
        }

        const courseStats: AuthorCourseStat[] = rows.map((r) => ({
            course_id: r.id,
            course_title: r.title,
            course_status: r.status,
            enrollments_count: r.enrollments_count,
            completions_count: r.completions_count,
            completion_rate: r.enrollments_count > 0
                ? Math.round((r.completions_count / r.enrollments_count) * 100)
                : 0,
            avg_rating: Number(r.avg_rating ?? 0),
            ratings_count: r.ratings_count,
            last_enrolled_at: lastEnrolledMap.get(r.id) ?? null,
        }))

        const totalEnrollments = courseStats.reduce((s, c) => s + c.enrollments_count, 0)
        const totalCompletions = courseStats.reduce((s, c) => s + c.completions_count, 0)
        const totalRatingPoints = courseStats.reduce((s, c) => s + c.avg_rating * c.ratings_count, 0)
        const totalRatingsCount = courseStats.reduce((s, c) => s + c.ratings_count, 0)
        const weightedAvg = totalRatingsCount > 0 ? totalRatingPoints / totalRatingsCount : 0

        return {
            success: true,
            data: {
                total_courses: courseStats.length,
                total_enrollments: totalEnrollments,
                total_completions: totalCompletions,
                average_rating: Math.round(weightedAvg * 10) / 10,
                courses: courseStats,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania analityki'
        console.error('[getAuthorAnalytics]', error)
        return { success: false, error: msg }
    }
}

export interface AdminLmsAnalytics {
    total_published_courses: number
    total_pending_review: number
    total_enrollments: number
    total_completions: number
    overall_completion_rate: number
    average_rating_all: number
    top_courses: Array<{
        course_id: string
        title: string
        enrollments: number
        completions: number
        completion_rate: number
        avg_rating: number
    }>
    monthly_enrollments: Array<{ month: string; count: number }> // last 12 mo
}

/**
 * A3.4: Admin LMS analytics dashboard data. Wymaga admin role.
 */
export async function getAdminLmsAnalytics(): Promise<{
    success: boolean
    data?: AdminLmsAnalytics
    error?: string
}> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single<{ role: string }>()
        if (!profile || profile.role !== 'admin') {
            return { success: false, error: 'Brak uprawnień (admin only)' }
        }

        const admin = createServiceClient()

        const [coursesRes, enrollsRes] = await Promise.all([
            admin
                .from('courses')
                .select('id, title, status, enrollments_count, completions_count, avg_rating, ratings_count'),
            // Last 12 months enrollments — group manually w JS bo Supabase API nie ma group-by
            admin
                .from('course_enrollments')
                .select('enrolled_at')
                .gte('enrolled_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()),
        ])

        const courses = (coursesRes.data ?? []) as Array<{
            id: string
            title: string
            status: string
            enrollments_count: number
            completions_count: number
            avg_rating: number
            ratings_count: number
        }>

        const published = courses.filter((c) => c.status === 'published')
        const pending = courses.filter((c) => c.status === 'pending_review')

        const totalEnr = published.reduce((s, c) => s + c.enrollments_count, 0)
        const totalCompl = published.reduce((s, c) => s + c.completions_count, 0)
        const overallRate = totalEnr > 0 ? Math.round((totalCompl / totalEnr) * 100) : 0
        const totalRatingPoints = published.reduce((s, c) => s + c.avg_rating * c.ratings_count, 0)
        const totalRatingsCount = published.reduce((s, c) => s + c.ratings_count, 0)
        const avgRating = totalRatingsCount > 0 ? totalRatingPoints / totalRatingsCount : 0

        const topCourses = [...published]
            .sort((a, b) => b.enrollments_count - a.enrollments_count)
            .slice(0, 10)
            .map((c) => ({
                course_id: c.id,
                title: c.title,
                enrollments: c.enrollments_count,
                completions: c.completions_count,
                completion_rate: c.enrollments_count > 0
                    ? Math.round((c.completions_count / c.enrollments_count) * 100)
                    : 0,
                avg_rating: Math.round(c.avg_rating * 10) / 10,
            }))

        // Monthly histogram
        const monthCounts = new Map<string, number>()
        for (const e of (enrollsRes.data ?? []) as Array<{ enrolled_at: string }>) {
            const month = e.enrolled_at.slice(0, 7) // YYYY-MM
            monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1)
        }
        const monthly = Array.from(monthCounts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, count]) => ({ month, count }))

        return {
            success: true,
            data: {
                total_published_courses: published.length,
                total_pending_review: pending.length,
                total_enrollments: totalEnr,
                total_completions: totalCompl,
                overall_completion_rate: overallRate,
                average_rating_all: Math.round(avgRating * 10) / 10,
                top_courses: topCourses,
                monthly_enrollments: monthly,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania analityki'
        console.error('[getAdminLmsAnalytics]', error)
        return { success: false, error: msg }
    }
}
