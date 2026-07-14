'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
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
): Promise<ActionResult<CourseQuestion[]>> {
    try {
        const supabase = createClient()
        let query = supabase
            .from('course_questions')
            .select('*')
            .eq('course_id', courseId)
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
            .from('profile_directory')
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
            .from('profile_directory')
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

/**
 * Zadaj pytanie (5 pkt loyalty bonus).
 */
export async function askQuestion(input: {
    courseId: string
    lessonId?: string | null
    questionText: string
}): Promise<ActionResult<{ id: string }>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const text = input.questionText.trim()
        if (text.length < 10 || text.length > 2000) {
            return { success: false, error: 'Pytanie musi mieć 10-2000 znaków.' }
        }

        const { data, error } = await supabase
            .from('course_questions')
            .insert({
                course_id: input.courseId,
                lesson_id: input.lessonId ?? null,
                user_id: user.id,
                question_text: text,
            })
            .select('id')
            .single<{ id: string }>()
        if (error) throw error

        // Loyalty bonus
        await supabase.from('loyalty_transactions').insert({
            user_id: user.id,
            source_type: 'course_question_asked',
            source_id: data.id,
            points: 5,
            description: 'Pytanie w forum kursu',
        })

        revalidatePath(`/learning`)
        return { success: true, data }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zadawania pytania'
        logCompat.error('[askQuestion]', error)
        return { success: false, error: msg }
    }
}

/**
 * Odpowiedz na pytanie. Jeśli user = autor kursu → 15 pkt loyalty + flag is_author_answer.
 */
export async function answerQuestion(input: {
    questionId: string
    answerText: string
}): Promise<ActionResult<{ id: string }>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const text = input.answerText.trim()
        if (text.length < 5 || text.length > 5000) {
            return { success: false, error: 'Odpowiedź musi mieć 5-5000 znaków.' }
        }

        // Sprawdź czy user jest autorem kursu (do flagi is_author_answer + loyalty bonus)
        const { data: q } = await supabase
            .from('course_questions')
            .select('course_id, courses:courses(author_id)')
            .eq('id', input.questionId)
            .single<{ course_id: string; courses: { author_id: string } | { author_id: string }[] }>()
        const author = Array.isArray(q?.courses) ? q?.courses[0] : q?.courses
        const isAuthor = author?.author_id === user.id

        const { data, error } = await supabase
            .from('course_answers')
            .insert({
                question_id: input.questionId,
                user_id: user.id,
                answer_text: text,
                is_author_answer: isAuthor,
            })
            .select('id')
            .single<{ id: string }>()
        if (error) throw error

        // Author answer = 15 pkt loyalty
        if (isAuthor) {
            await supabase.from('loyalty_transactions').insert({
                user_id: user.id,
                source_type: 'course_answer_given',
                source_id: data.id,
                points: 15,
                description: 'Odpowiedź autora w forum kursu',
            })
            // Mark resolved jeśli to pierwsza autorska odpowiedź
            await supabase
                .from('course_questions')
                .update({ is_resolved: true })
                .eq('id', input.questionId)
        }

        revalidatePath(`/learning`)
        return { success: true, data }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd odpowiedzi'
        logCompat.error('[answerQuestion]', error)
        return { success: false, error: msg }
    }
}
