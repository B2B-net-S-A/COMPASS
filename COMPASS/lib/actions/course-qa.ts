'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { loadAcademyCourse } from '@/lib/academy/course-data'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types/learning'

// ============================================================
// A2.3 — Course Q&A Forum server actions
// ============================================================

export interface CourseQuestion {
    id: string
    course_id: string
    lesson_id: string | null
    user_id: string
    question_text: string
    is_resolved: boolean
    answers_count: number
    created_at: string
    user_full_name: string | null
    user_avatar_url: string | null
}

export interface CourseAnswer {
    id: string
    question_id: string
    user_id: string
    answer_text: string
    is_author_answer: boolean
    created_at: string
    user_full_name: string | null
    user_avatar_url: string | null
}

/**
 * Lista pytań dla kursu (najnowsze pierwsze) — wszystkie lub tylko per lesson.
 */
export async function listCourseQuestions(
    courseId: string,
    lessonId?: string,
    enrollmentId?: string,
    previewVersionId?: string,
): Promise<ActionResult<CourseQuestion[]>> {
    try {
        const { client: supabase, access } = await requireAcademyContext()
        const { course } = await loadAcademyCourse(supabase, access.userId, z.uuid().parse(courseId), { enrollmentId, previewVersionId })
        let query = supabase
            .from('course_questions')
            .select('*')
            .eq('course_id', courseId)
            .eq('version_id', course.version_id)
            .order('created_at', { ascending: false })
        if (lessonId) {
            query = query.eq('lesson_id', lessonId)
        }
        const { data: questions, error } = await query
        if (error) throw error

        type QRow = {
            id: string
            course_id: string
            lesson_id: string | null
            user_id: string
            question_text: string
            is_resolved: boolean
            answers_count: number
            created_at: string
        }
        const rows = (questions ?? []) as QRow[]
        if (rows.length === 0) return { success: true, data: [] }

        // Pull profile names
        const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds)
        const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        for (const p of (profiles ?? []) as Array<{
            id: string
            full_name: string | null
            avatar_url: string | null
        }>) {
            profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
        }

        const items: CourseQuestion[] = rows.map((r) => ({
            ...r,
            user_full_name: profileMap.get(r.user_id)?.full_name ?? null,
            user_avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
        }))

        return { success: true, data: items }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania pytań'
        logCompat.error('[listCourseQuestions]', error)
        return { success: false, error: msg }
    }
}

/**
 * Lista odpowiedzi dla pytania (najstarsze pierwsze — chronologia dyskusji).
 */
export async function listAnswersForQuestion(
    questionId: string,
): Promise<ActionResult<CourseAnswer[]>> {
    try {
        const supabase = createClient()
        const { data: answers, error } = await supabase
            .from('course_answers')
            .select('*')
            .eq('question_id', questionId)
            .order('created_at', { ascending: true })
        if (error) throw error

        type ARow = {
            id: string
            question_id: string
            user_id: string
            answer_text: string
            is_author_answer: boolean
            created_at: string
        }
        const rows = (answers ?? []) as ARow[]
        if (rows.length === 0) return { success: true, data: [] }

        const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds)
        const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        for (const p of (profiles ?? []) as Array<{
            id: string
            full_name: string | null
            avatar_url: string | null
        }>) {
            profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
        }

        const items: CourseAnswer[] = rows.map((r) => ({
            ...r,
            user_full_name: profileMap.get(r.user_id)?.full_name ?? null,
            user_avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
        }))

        return { success: true, data: items }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania odpowiedzi'
        logCompat.error('[listAnswersForQuestion]', error)
        return { success: false, error: msg }
    }
}

/** Questions are scoped to the learner's immutable enrollment version. */
export async function askQuestion(input: {
    courseId: string
    lessonId?: string | null
    enrollmentId?: string
    questionText: string
}): Promise<ActionResult<{ id: string }>> {
    return academyAction('question.create', async () => {
        const { client, access } = await requireAcademyContext()
        const { enrollment } = await loadAcademyCourse(client, access.userId, z.uuid().parse(input.courseId), { enrollmentId: input.enrollmentId })
        if (!enrollment) throw new Error('Najpierw zapisz się na szkolenie.')
        const { data, error } = await client.rpc('academy_ask_question', {
            p_enrollment_id: enrollment.id,
            p_question_text: z.string().trim().min(10).max(2000).parse(input.questionText),
            p_lesson_id: input.lessonId ? z.uuid().parse(input.lessonId) : null,
        })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return { id: data as string }
    })
}

export async function answerQuestion(input: { questionId: string; answerText: string }): Promise<ActionResult<{ id: string }>> {
    return academyAction('question.answer', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_answer_question', {
            p_question_id: z.uuid().parse(input.questionId),
            p_answer_text: z.string().trim().min(5).max(5000).parse(input.answerText),
        })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return { id: data as string }
    })
}

export async function resolveCourseQuestion(questionId: string, resolved: boolean): Promise<ActionResult<void>> {
    return academyAction('question.resolve', async () => {
        const { client } = await requireAcademyContext()
        const { error } = await client.rpc('academy_resolve_question', { p_question_id: z.uuid().parse(questionId), p_resolved: z.boolean().parse(resolved) })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
    })
}

/** Minimal selector of versions available to an assigned instructor or editor. */
export async function listTeachingQuestionVersions(courseId: string) {
    return academyAction('question.teaching_versions', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_teaching_versions', { p_course_id: z.uuid().parse(courseId) })
        assertDatabaseResult(error)
        return (data ?? []) as Array<{ id: string; versionNumber: number; title: string; status: string }>
    })
}
