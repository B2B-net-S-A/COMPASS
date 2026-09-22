'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import type { ActionResult } from '@/lib/types/learning'

export interface AuthorCourseStat {
    course_id: string
    course_title: string
    course_status: string
    enrollments_count: number
    completions_count: number
    completion_rate: number
    avg_rating: number
    ratings_count: number
    last_enrolled_at: string | null
}
export interface AuthorAnalyticsSummary {
    total_courses: number
    total_enrollments: number
    total_completions: number
    average_rating: number
    courses: AuthorCourseStat[]
}
export interface AdminLmsAnalytics {
    total_published_courses: number
    total_pending_review: number
    total_enrollments: number
    total_completions: number
    overall_completion_rate: number
    average_rating_all: number
    top_courses: Array<{ course_id: string; title: string; enrollments: number; completions: number; completion_rate: number; avg_rating: number }>
    monthly_enrollments: Array<{ month: string; count: number }>
}
interface ReportCourse { id: string; title: string; status: string; published_version_id: string | null; legacy_review_required: boolean }
interface ReportEnrollment { id: string; course_id: string; run_id: string | null; enrolled_at: string }
interface ReportCompletion { id: string; course_id: string; enrollment_id: string }
interface ReportVersion { id: string; course_id: string; status: string }

// Session-bound RLS also limits a run-only facilitator to their own groups.
// Pagination avoids quietly reporting only the first PostgREST response page.
async function readRows<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
    const rows: T[] = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
        let query = client.from(table).select(columns).order('id').range(offset, offset + pageSize - 1)
        if (table === 'course_completions') query = query.is('revoked_at', null)
        const { data, error } = await query
        assertDatabaseResult(error)
        rows.push(...(data ?? []) as T[])
        if (!data || data.length < pageSize) return rows
    }
}

async function readReport(client: SupabaseClient, courses: ReportCourse[]) {
    if (!courses.length) return { rows: [] as AuthorCourseStat[], versions: [] as ReportVersion[], enrollments: [] as ReportEnrollment[] }
    const [allEnrollments, completions, registrations, runs, ratings, versions] = await Promise.all([
        readRows<ReportEnrollment>(client, 'course_enrollments', 'id,course_id,run_id,enrolled_at'),
        readRows<ReportCompletion>(client, 'course_completions', 'id,course_id,enrollment_id'),
        readRows<{ id: string; enrollment_id: string | null; status: string }>(client, 'course_run_registrations', 'id,enrollment_id,status'),
        readRows<{ id: string; status: string }>(client, 'course_runs', 'id,status'),
        readRows<{ id: string; course_id: string; rating: number }>(client, 'course_ratings', 'id,course_id,rating'),
        readRows<ReportVersion>(client, 'course_versions', 'id,course_id,status'),
    ])
    const courseIds = new Set(courses.map(course => course.id))
    const completedIds = new Set(completions.map(completion => completion.enrollment_id))
    const confirmedIds = new Set(registrations.filter(registration => registration.status === 'confirmed').map(registration => registration.enrollment_id))
    const activeRunIds = new Set(runs.filter(run => run.status === 'published').map(run => run.id))
    const enrollments = allEnrollments.filter(enrollment => courseIds.has(enrollment.course_id) && (
        completedIds.has(enrollment.id) || !enrollment.run_id || (confirmedIds.has(enrollment.id) && activeRunIds.has(enrollment.run_id))
    ))
    const rows = courses.map(course => {
        const enrolled = enrollments.filter(enrollment => enrollment.course_id === course.id)
        const completed = enrolled.filter(enrollment => completedIds.has(enrollment.id)).length
        const courseRatings = ratings.filter(rating => rating.course_id === course.id)
        return {
            course_id: course.id, course_title: course.title, course_status: course.status,
            enrollments_count: enrolled.length, completions_count: completed,
            completion_rate: enrolled.length ? Math.round(completed / enrolled.length * 100) : 0,
            avg_rating: courseRatings.length ? courseRatings.reduce((sum, rating) => sum + rating.rating, 0) / courseRatings.length : 0,
            ratings_count: courseRatings.length,
            last_enrolled_at: enrolled.map(enrollment => enrollment.enrolled_at).sort().at(-1) ?? null,
        }
    }).sort((a, b) => b.enrollments_count - a.enrollments_count || a.course_title.localeCompare(b.course_title, 'pl'))
    return { rows, versions, enrollments }
}

function summarize(rows: AuthorCourseStat[]): AuthorAnalyticsSummary {
    const ratings = rows.reduce((sum, course) => sum + course.ratings_count, 0)
    return {
        total_courses: rows.length,
        total_enrollments: rows.reduce((sum, course) => sum + course.enrollments_count, 0),
        total_completions: rows.reduce((sum, course) => sum + course.completions_count, 0),
        average_rating: ratings ? Math.round(rows.reduce((sum, course) => sum + course.avg_rating * course.ratings_count, 0) / ratings * 10) / 10 : 0,
        courses: rows,
    }
}

export async function getAuthorAnalytics(): Promise<ActionResult<AuthorAnalyticsSummary>> {
    return academyAction('analytics.teaching', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_teaching_courses')
        assertDatabaseResult(error)
        const courses = (data ?? []) as Array<ReportCourse & { can_lead?: boolean; can_manage_assigned_runs?: boolean }>
        const monitored = courses.filter(course => course.can_lead || course.can_manage_assigned_runs)
        return summarize((await readReport(client, monitored)).rows)
    })
}

export async function getAdminLmsAnalytics(): Promise<ActionResult<AdminLmsAnalytics>> {
    return academyAction('analytics.admin', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const courses = await readRows<ReportCourse>(client, 'courses', 'id,title,status,published_version_id,legacy_review_required')
        const report = await readReport(client, courses)
        const summary = summarize(report.rows)
        const publishedVersions = new Set(report.versions.filter(version => version.status === 'published').map(version => version.id))
        const months = Array.from({ length: 12 }, (_, index) => {
            const now = new Date()
            const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1)).toISOString().slice(0, 7)
            return { month, count: report.enrollments.filter(enrollment => enrollment.enrolled_at.slice(0, 7) === month).length }
        })
        return {
            total_published_courses: courses.filter(course => !course.legacy_review_required && course.status !== 'archived' && !!course.published_version_id && publishedVersions.has(course.published_version_id)).length,
            total_pending_review: report.versions.filter(version => version.status === 'pending_review').length,
            total_enrollments: summary.total_enrollments,
            total_completions: summary.total_completions,
            overall_completion_rate: summary.total_enrollments ? Math.round(summary.total_completions / summary.total_enrollments * 100) : 0,
            average_rating_all: summary.average_rating,
            top_courses: report.rows.slice(0, 10).map(course => ({ course_id: course.course_id, title: course.course_title, enrollments: course.enrollments_count, completions: course.completions_count, completion_rate: course.completion_rate, avg_rating: course.avg_rating })),
            monthly_enrollments: months,
        }
    })
}
