'use server'

import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { loadAcademyCourse } from '@/lib/academy/course-data'
import type { ActionResult } from '@/lib/types/learning'

export interface AcademyCatalogOptions {
    categories: string[]
    instructors: { id: string; name: string }[]
}
export interface AcademyPrerequisiteChoice { id: string; title: string; slug: string }
export interface AcademyPrerequisiteStatus {
    items: { id: string; title: string; slug: string | null; completed: boolean; available: boolean }[]
    allCompleted: boolean
}

/** Only fields already visible in the published catalogue; never an employee directory. */
export async function getAcademyCatalogOptions(): Promise<ActionResult<AcademyCatalogOptions>> {
    return academyAction('catalog_options', async () => {
        const { client } = await requireAcademyContext()
        const categories = new Set<string>()
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await client.from('courses').select('id,category')
                .eq('status', 'published').eq('legacy_review_required', false).not('published_version_id', 'is', null)
                .order('id').range(offset, offset + 999)
            assertDatabaseResult(error)
            for (const row of data ?? []) {
                if (row.category) categories.add(row.category)
            }
            if (!data || data.length < 1000) break
        }
        const { data: instructorRows, error: instructorError } = await client.rpc('academy_catalog_instructors')
        assertDatabaseResult(instructorError)
        const instructors = z.array(z.object({ id: z.uuid(), name: z.string() })).parse(instructorRows ?? [])
        return { categories: [...categories].sort((a, b) => a.localeCompare(b, 'pl')), instructors: instructors.sort((a, b) => a.name.localeCompare(b.name, 'pl')) }
    })
}

export async function listAcademyPrerequisiteChoices(input: { search?: string; selectedIds?: string[]; excludeCourseId?: string } = {}): Promise<ActionResult<AcademyPrerequisiteChoice[]>> {
    return academyAction('prerequisite_choices', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const parsed = z.object({ search: z.string().trim().max(200).optional(), selectedIds: z.array(z.uuid()).max(50).optional(), excludeCourseId: z.uuid().optional() }).parse(input)
        let query = client.from('courses').select('id,title,slug').eq('status', 'published')
            .eq('legacy_review_required', false).not('published_version_id', 'is', null)
        if (parsed.excludeCourseId) query = query.neq('id', parsed.excludeCourseId)
        if (parsed.selectedIds) {
            if (parsed.selectedIds.length === 0) return []
            query = query.in('id', parsed.selectedIds)
        } else if (parsed.search) {
            // Escape SQL LIKE wildcards so a typed title is searched literally.
            query = query.ilike('title', `%${parsed.search.replace(/[\\%_]/g, '\\$&')}%`)
        }
        const { data, error } = await query.order('title').order('id').limit(50)
        assertDatabaseResult(error)
        return (data ?? []) as AcademyPrerequisiteChoice[]
    })
}

export async function getAcademyPrerequisiteStatus(input: { courseId: string; enrollmentId?: string; versionId?: string }): Promise<ActionResult<AcademyPrerequisiteStatus>> {
    return academyAction('prerequisite_status', async () => {
        const { client, access } = await requireAcademyContext()
        const parsed = z.object({ courseId: z.uuid(), enrollmentId: z.uuid().optional(), versionId: z.uuid().optional() }).parse(input)
        let ids: string[]
        if (parsed.versionId) {
            // RLS decides whether this exact run/retained version is visible.
            const { data, error } = await client.from('course_versions').select('metadata').eq('course_id', parsed.courseId).eq('id', parsed.versionId).single()
            assertDatabaseResult(error)
            if (!data) throw new Error('Wersja szkolenia jest niedostępna.')
            ids = z.array(z.uuid()).parse(data.metadata.prerequisite_course_ids ?? [])
        } else {
            const { course } = await loadAcademyCourse(client, access.userId, parsed.courseId, { enrollmentId: parsed.enrollmentId })
            ids = course.prerequisite_course_ids ?? []
        }
        if (ids.length === 0) return { items: [], allCompleted: true }
        const [courses, completions] = await Promise.all([
            client.from('courses').select('id,title,slug,status,legacy_review_required').in('id', ids),
            client.from('course_completions').select('course_id').is('revoked_at', null).eq('user_id', access.userId).in('course_id', ids),
        ])
        assertDatabaseResult(courses.error)
        assertDatabaseResult(completions.error)
        const completed = new Set((completions.data ?? []).map((row) => row.course_id))
        const items = ids.map((id) => {
            const course = courses.data?.find((row) => row.id === id)
            const available = course?.status === 'published' && !course.legacy_review_required
            return { id, title: course?.title ?? 'Niedostępne szkolenie', slug: available ? course.slug : null, completed: completed.has(id), available }
        })
        return { items, allCompleted: items.every((item) => item.completed) }
    })
}
