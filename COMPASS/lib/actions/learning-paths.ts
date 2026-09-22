'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { withCourseVersion, type CourseVersion } from '@/lib/academy/course-data'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Course, LearningPath, LearningPathCourseLink, LearningPathDetail, LearningPathListItem } from '@/lib/types/learning'

interface PathEnrollment { path_id: string; completed_at: string | null; required_course_ids: string[] }

async function pathReadState(client: SupabaseClient, userId: string, pathIds: string[]) {
    const [links, enrollments] = await Promise.all([
        client.from('learning_path_courses').select('path_id,course_id,order_index,is_required').in('path_id', pathIds).order('order_index'),
        client.from('learning_path_enrollments').select('path_id,completed_at,required_course_ids').eq('user_id', userId).in('path_id', pathIds),
    ])
    assertDatabaseResult(links.error)
    assertDatabaseResult(enrollments.error)
    const byPath = new Map<string, LearningPathCourseLink[]>()
    const enrolled = new Map<string, PathEnrollment>((enrollments.data ?? []).map(row => [row.path_id, row as PathEnrollment]))
    for (const pathId of pathIds) {
        const current = (links.data ?? []).filter(row => row.path_id === pathId) as (LearningPathCourseLink & { path_id: string })[]
        const snapshot = enrolled.get(pathId)
        if (!snapshot) { byPath.set(pathId, current); continue }
        const required = snapshot.required_course_ids ?? []
        byPath.set(pathId, [
            ...required.map((courseId, index) => ({ course_id: courseId, order_index: index, is_required: true })),
            ...current.filter(row => !row.is_required && !required.includes(row.course_id)).map((row, index) => ({ ...row, order_index: required.length + index })),
        ])
    }
    const courseIds = [...new Set([...byPath.values()].flatMap(rows => rows.map(row => row.course_id)))]
    const completions = courseIds.length ? await client.from('course_completions').select('course_id').is('revoked_at', null).eq('user_id', userId).in('course_id', courseIds) : { data: [], error: null }
    assertDatabaseResult(completions.error)
    return { byPath, enrolled, completed: new Set((completions.data ?? []).map(row => row.course_id as string)) }
}

export async function listLearningPaths(): Promise<ActionResult<LearningPathListItem[]>> {
    return academyAction('path.list', async () => {
        const { client, access } = await requireAcademyContext()
        const { data, error } = await client.from('learning_paths').select('*').eq('status', 'published').order('created_at', { ascending: false })
        assertDatabaseResult(error)
        const paths = (data ?? []) as LearningPath[]
        if (!paths.length) return []
        const state = await pathReadState(client, access.userId, paths.map(path => path.id))
        return paths.map(path => {
            const links = state.byPath.get(path.id) ?? []
            const required = links.filter(link => link.is_required)
            const enrollment = state.enrolled.get(path.id)
            const done = required.filter(link => state.completed.has(link.course_id)).length
            return { ...path, course_count: links.length, is_enrolled: !!enrollment, progress_percent: enrollment?.completed_at ? 100 : enrollment && required.length ? Math.round(done / required.length * 100) : 0 }
        })
    })
}

export async function getLearningPathDetail(slug: string): Promise<ActionResult<LearningPathDetail>> {
    return academyAction('path.detail', async () => {
        const { client, access } = await requireAcademyContext()
        const { data: path, error } = await client.from('learning_paths').select('*').eq('slug', z.string().min(1).max(200).parse(slug)).single()
        assertDatabaseResult(error)
        if (!path) throw new Error('Ścieżka nie istnieje.')
        const state = await pathReadState(client, access.userId, [path.id])
        const links = state.byPath.get(path.id) ?? []
        const courseIds = links.map(link => link.course_id)
        const [courses, enrollments] = courseIds.length ? await Promise.all([
            client.from('courses').select('*').in('id', courseIds),
            client.from('course_enrollments').select('id,course_id,version_id,run_id,completed_at,enrolled_at').eq('user_id', access.userId).in('course_id', courseIds).order('enrolled_at', { ascending: false }),
        ]) : [{ data: [], error: null }, { data: [], error: null }]
        assertDatabaseResult(courses.error)
        assertDatabaseResult(enrollments.error)
        const active: { id: string; course_id: string; version_id: string; run_id: string | null; completed_at: string | null; enrolled_at: string }[] = []
        for (const enrollment of enrollments.data ?? []) {
            // Matches material access, so withdrawn live registrations cannot become Continue links.
            const result = await client.rpc('academy_enrollment_has_access', { p_enrollment_id: enrollment.id })
            assertDatabaseResult(result.error)
            if (result.data) active.push(enrollment)
        }
        const versionIds = [...new Set(active.map(enrollment => enrollment.version_id))]
        const versions = versionIds.length ? await client.from('course_versions').select('*').in('id', versionIds) : { data: [], error: null }
        assertDatabaseResult(versions.error)
        const entries = links.map(link => {
            const course = courses.data?.find(row => row.id === link.course_id) as Course | undefined
            const own = active.filter(enrollment => enrollment.course_id === link.course_id)
            // Resume unfinished work first, otherwise retain the most recent completed evidence.
            const enrollment = own.find(row => !row.completed_at) ?? own[0]
            const version = versions.data?.find(row => row.id === enrollment?.version_id) as CourseVersion | undefined
            return { ...link, course: course ? version ? withCourseVersion(course, version) : course : null, is_completed: state.completed.has(link.course_id), is_enrolled: !!enrollment, enrollment_id: enrollment?.id ?? null, run_id: enrollment?.run_id ?? null }
        })
        const required = entries.filter(entry => entry.is_required)
        const done = required.filter(entry => entry.is_completed).length
        const enrollment = state.enrolled.get(path.id)
        return { ...(path as LearningPath), courses: entries, is_enrolled_in_path: !!enrollment, completed_courses_count: done, total_courses_count: required.length, progress_percent: enrollment?.completed_at ? 100 : required.length ? Math.round(done / required.length * 100) : 0, completed_at: enrollment?.completed_at ?? null }
    })
}

export async function enrollInLearningPath(pathId: string): Promise<ActionResult<{ enrollmentId: string }>> {
    return academyAction('path.enroll', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_enroll_path', { p_path_id: z.uuid().parse(pathId) })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return { enrollmentId: data as string }
    })
}

export async function checkLearningPathCompletion(pathId: string): Promise<ActionResult<{ now_completed: boolean; completed: boolean }>> {
    return academyAction('path.complete', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_complete_path', { p_path_id: z.uuid().parse(pathId) })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return data as { now_completed: boolean; completed: boolean }
    })
}
