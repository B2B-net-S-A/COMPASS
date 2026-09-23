import 'server-only'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Course, CourseCompletionRules, CourseStatus } from '@/lib/types/learning'
import { assertDatabaseResult } from './server'

export const completionRulesSchema = z.object({
    quiz_required: z.boolean(),
    quiz_pass_percent: z.number().int().min(1).max(100),
    require_all_lessons: z.boolean(),
    attendance_percent: z.number().int().min(1).max(100),
})

export const courseMetadataSchema = z.object({
    title: z.string().trim().min(3, 'Tytuł musi mieć co najmniej 3 znaki.').max(200),
    description: z.string().trim().max(12000).nullable().optional(),
    category: z.string().trim().min(1).max(100),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    duration_minutes: z.number().int().min(1).max(60000).nullable().optional(),
    cover_image_url: z.string().url().startsWith('https://').max(2000).nullable().optional(),
    delivery_mode: z.enum(['self_paced', 'live', 'blended']).optional(),
    prerequisite_course_ids: z.array(z.uuid()).max(50).refine(ids => new Set(ids).size === ids.length, 'Nie powtarzaj wymagań wstępnych.').optional(),
    completion_rules: completionRulesSchema.optional(),
})

export interface CourseVersion {
    id: string
    course_id: string
    version_number: number
    submission_id?: string | null
    status: CourseStatus
    metadata: Partial<Course>
    completion_rules: CourseCompletionRules
    rejection_reason: string | null
    reviewed_by: string | null
    reviewed_at: string | null
}

export function withCourseVersion(course: Course, version: CourseVersion): Course {
    return {
        ...course,
        ...version.metadata,
        id: course.id,
        slug: course.slug,
        author_id: course.author_id,
        published_version_id: course.published_version_id,
        draft_version_id: course.draft_version_id,
        version_id: version.id,
        version_number: version.version_number,
        submission_id: version.submission_id ?? null,
        status: course.status,
        version_status: version.status,
        completion_rules: version.completion_rules,
        rejection_reason: version.rejection_reason,
        reviewed_by: version.reviewed_by,
        reviewed_at: version.reviewed_at,
    }
}

export async function loadAcademyCourse(
    client: SupabaseClient,
    userId: string,
    identifier: string,
    options: { author?: boolean; enrollmentId?: string; publishedOnly?: boolean; previewVersionId?: string } = {},
) {
    const field = z.uuid().safeParse(identifier).success ? 'id' : 'slug'
    const { data: row, error } = await client.from('courses').select('*').eq(field, identifier).single()
    assertDatabaseResult(error)
    if (!row) throw new Error('Szkolenie nie istnieje lub nie masz do niego dostępu.')
    const course = row as Course
    let enrollmentQuery = client.from('course_enrollments').select('id,version_id,run_id,completed_at,completed_lessons,lesson_completion_dates')
        .eq('course_id', course.id).eq('user_id', userId)
    if (options.enrollmentId) enrollmentQuery = enrollmentQuery.eq('id', z.uuid().parse(options.enrollmentId))
    else enrollmentQuery = enrollmentQuery.is('run_id', null)
    const { data: enrollment, error: enrollmentError } = await enrollmentQuery.maybeSingle()
    assertDatabaseResult(enrollmentError)
    if (options.enrollmentId && !enrollment) throw new Error('Nie masz dostępu do tego zapisu.')
    let versionId = enrollment?.version_id ?? course.published_version_id
    if (options.author || options.publishedOnly || !versionId) {
        const { data: canManage, error: accessError } = await client.rpc('academy_can_manage_course', { p_course_id: course.id })
        assertDatabaseResult(accessError)
        if (!canManage) throw new Error('Nie masz dostępu do wersji roboczej tego szkolenia.')
        versionId = options.publishedOnly ? course.published_version_id : course.draft_version_id ?? course.published_version_id
    }
    if (options.previewVersionId) {
        versionId = z.uuid().parse(options.previewVersionId)
        const { data: allowed, error: previewError } = await client.rpc('academy_can_preview_version', { p_version_id: versionId })
        assertDatabaseResult(previewError)
        if (!allowed) throw new Error('Nie masz dostępu do podglądu tej wersji programu.')
    }
    if (!versionId) throw new Error('Szkolenie nie ma jeszcze dostępnej wersji.')
    const { data: version, error: versionError } = await client.from('course_versions').select('*').eq('id', versionId).eq('course_id', course.id).single()
    assertDatabaseResult(versionError)
    if (!version) throw new Error('Wersja szkolenia jest niedostępna.')
    const completion = enrollment?.completed_at && !options.previewVersionId
        ? await client.from('course_completions').select('revoked_at,revoked_reason').eq('enrollment_id', enrollment.id).eq('user_id', userId).maybeSingle()
        : { data: null, error: null }
    assertDatabaseResult(completion.error)
    const enrollmentState = enrollment ? { ...enrollment, completion_revoked_at: completion.data?.revoked_at ?? null, completion_revoked_reason: completion.data?.revoked_reason ?? null } : null
    return { course: withCourseVersion(course, version as CourseVersion), version: version as CourseVersion, enrollment: options.previewVersionId ? null : enrollmentState }
}
