'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { withCourseVersion, type CourseVersion } from '@/lib/academy/course-data'
import type { Course, CourseListItem, ActionResult } from '@/lib/types/learning'

export async function getReviewQueue(): Promise<ActionResult<CourseListItem[]>> {
    return academyAction('review.queue', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { data: versions, error } = await client.from('course_versions').select('*').eq('status', 'pending_review').order('submitted_at')
        assertDatabaseResult(error)
        if (!versions?.length) return []
        const { data: courses, error: coursesError } = await client.from('courses').select('*').in('id', versions.map(v => v.course_id))
        assertDatabaseResult(coursesError)
        const { data: authors, error: authorsError } = await client.from('profiles').select('id,full_name,avatar_url').in('id', [...new Set((courses ?? []).map(c => c.author_id))])
        assertDatabaseResult(authorsError)
        return (versions as CourseVersion[]).flatMap(version => {
            const course = courses?.find(c => c.id === version.course_id) as Course | undefined
            if (!course) return []
            const author = authors?.find(a => a.id === course.author_id)
            return [{ ...withCourseVersion(course, version), author_name: author?.full_name ?? null, author_avatar_url: author?.avatar_url ?? null }]
        })
    })
}

async function review(courseId: string, versionId: string | undefined, submissionId: string | null | undefined, approve: boolean, reason?: string) {
    const { client } = await requireAcademyContext({ admin: true })
    if (!versionId || !submissionId) throw new Error('Odśwież podgląd wersji przed podjęciem decyzji.')
    const parsed = z.object({ courseId: z.uuid(), versionId: z.uuid(), submissionId: z.uuid() }).parse({ courseId, versionId, submissionId })
    const { data: version, error: versionError } = await client.from('course_versions').select('id').eq('id', parsed.versionId).eq('course_id', parsed.courseId).single()
    assertDatabaseResult(versionError)
    if (!version) throw new Error('Wersja nie należy do tego szkolenia.')
    const { data, error } = await client.rpc('academy_review_course', { p_version_id: parsed.versionId, p_approve: approve, p_reason: reason?.trim() ?? null, p_submission_id: parsed.submissionId })
    assertDatabaseResult(error)
    revalidatePath('/learning', 'layout')
    revalidatePath('/admin/learning', 'layout')
    return data
}

export async function approveCourse(courseId: string, versionId?: string, submissionId?: string | null): Promise<ActionResult<{ firstPublishBonus: boolean }>> {
    return academyAction('review.approve', async () => {
        const result = await review(courseId, versionId, submissionId, true)
        return { firstPublishBonus: result?.first_publish_bonus === true }
    })
}

export async function rejectCourse(courseId: string, reason: string, versionId?: string, submissionId?: string | null): Promise<ActionResult<void>> {
    return academyAction('review.reject', async () => {
        const parsedReason = z.string().trim().min(5).max(3000).parse(reason)
        await review(courseId, versionId, submissionId, false, parsedReason)
    })
}

export async function archiveCourse(courseId: string): Promise<ActionResult<void>> {
    return academyAction('course.archive', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_archive_course', { p_course_id: z.uuid().parse(courseId) })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        revalidatePath('/admin/learning', 'layout')
    })
}

/** Historical publication is blocked for new enrollments until independently reviewed. */
export async function getLegacyReviewQueue(): Promise<ActionResult<Course[]>> {
    return academyAction('review.legacy_queue', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.from('courses').select('*').eq('legacy_review_required', true).eq('status', 'published').order('published_at')
        assertDatabaseResult(error)
        return (data ?? []) as Course[]
    })
}

export async function canReviewCourseVersion(versionId: string): Promise<ActionResult<boolean>> {
    return academyAction('review.permission', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.rpc('academy_can_review_version', { p_version_id: z.uuid().parse(versionId) })
        assertDatabaseResult(error)
        return data === true
    })
}

export async function reviewLegacyCourse(courseId: string, versionId: string, approve: boolean, reason?: string): Promise<ActionResult<{ firstPublishBonus: boolean }>> {
    return academyAction('review.legacy', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const parsed = z.object({ courseId: z.uuid(), versionId: z.uuid(), approve: z.boolean(), reason: z.string().trim().max(3000).optional() }).parse({ courseId, versionId, approve, reason })
        if (!approve) z.string().min(5).parse(parsed.reason)
        const { error } = await client.rpc('academy_review_legacy_course', { p_course_id: parsed.courseId, p_version_id: parsed.versionId, p_approve: parsed.approve, p_reason: parsed.reason ?? null })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout'); revalidatePath('/admin/learning', 'layout')
        return { firstPublishBonus: false }
    })
}
