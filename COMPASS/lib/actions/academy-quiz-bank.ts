'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import type { ActionResult, CourseCompletionRules } from '@/lib/types/learning'
import type { BankQuestion } from '@/lib/academy/quiz-bank'

export interface QuizBankAnalysisRow { question_id: string; responses: number; correct_percent: number | null; options: { option_id: string; is_correct: boolean; count: number }[] }
export interface QuizBank {
    courseId: string
    versionId: string
    versionNumber: number
    status: string
    editable: boolean
    rules: CourseCompletionRules
    attemptLimit: number | null
    attemptWindowHours: number | null
    questions: (BankQuestion & { id: string; order_index: number; options: (BankQuestion['options'][number] & { id: string })[] })[]
    keyVisible: boolean
    analysis: QuizBankAnalysisRow[]
}
export type QuizBankResult = { awaitingMigration: true } | ({ awaitingMigration: false } & QuizBank)

const optionSchema = z.object({ option_text: z.string().trim().min(1).max(2000), is_correct: z.boolean(), explanation: z.string().trim().max(2000).nullable().optional() })
const questionSchema = z.object({
    question_text: z.string().trim().min(1).max(8000),
    topic_tag: z.string().trim().min(1).max(80).nullable(),
    pool_status: z.enum(['draft', 'approved']),
    options: z.array(optionSchema).min(2).max(6),
})
const settingsSchema = z.object({
    draw_count: z.number().int().min(1).max(100).nullable(),
    quiz_pass_percent: z.number().int().min(1).max(100),
    time_limit_minutes: z.number().int().min(1).max(480).nullable(),
    pre_test_count: z.number().int().min(1).max(50).nullable(),
    draw_random: z.boolean(),
    shuffle_options: z.boolean(),
    show_explanations: z.boolean(),
    attempt_limit: z.number().int().min(1).max(10),
    attempt_window_hours: z.number().int().min(1).max(168),
})

export async function getQuizBank(courseId: string): Promise<ActionResult<QuizBankResult>> {
    return academyAction('quiz_bank.get', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const id = z.uuid().parse(courseId)
        const { data: course, error: courseError } = await client.from('courses').select('id,draft_version_id,published_version_id').eq('id', id).single()
        assertDatabaseResult(courseError)
        const versionId = course?.draft_version_id ?? course?.published_version_id
        if (!versionId) throw new Error('Szkolenie nie ma jeszcze wersji programu.')
        const { data: version, error: versionError } = await client.from('course_versions').select('id,version_number,status,completion_rules,quiz_attempt_limit,quiz_attempt_window_hours').eq('id', versionId).single()
        assertDatabaseResult(versionError)
        const { data: questions, error: questionsError } = await client.from('course_quiz_questions')
            .select('id,order_index,question_text,topic_tag,pool_status,voided_at,void_reason').eq('version_id', versionId).order('order_index')
        if (isMissingDatabaseObject(questionsError)) return { awaitingMigration: true } as const
        assertDatabaseResult(questionsError)
        const ids = (questions ?? []).map(question => question.id as string)
        const { data: options, error: optionsError } = ids.length
            ? await client.from('course_quiz_options').select('id,question_id,order_index,option_text,is_correct,explanation').in('question_id', ids).order('order_index')
            : { data: [], error: null }
        assertDatabaseResult(optionsError)
        const { data: analysis, error: analysisError } = await client.rpc('academy_question_analysis', { p_version_id: versionId })
        // Analiza jest dodatkiem do ekranu: brak migracji albo brak dostępu do klucza nie zamyka banku.
        const analysisRows = analysisError ? [] : (analysis as QuizBankAnalysisRow[])
        return {
            awaitingMigration: false as const, courseId: id, versionId, versionNumber: version!.version_number as number, status: version!.status as string,
            editable: ['draft', 'rejected'].includes(version!.status as string),
            rules: version!.completion_rules as CourseCompletionRules,
            attemptLimit: version!.quiz_attempt_limit as number | null, attemptWindowHours: version!.quiz_attempt_window_hours as number | null,
            keyVisible: (options ?? []).length > 0 || ids.length === 0,
            analysis: analysisRows,
            questions: (questions ?? []).map(question => ({
                id: question.id as string, order_index: question.order_index as number, question_text: question.question_text as string,
                topic_tag: question.topic_tag as string | null, pool_status: question.pool_status as 'draft' | 'approved',
                voided_at: question.voided_at as string | null, void_reason: question.void_reason as string | null,
                options: (options ?? []).filter(option => option.question_id === question.id).map(option => ({ id: option.id as string, option_text: option.option_text as string, is_correct: option.is_correct as boolean, explanation: option.explanation as string | null })),
            })),
        }
    })
}

export async function saveQuizBank(courseId: string, questions: unknown[]): Promise<ActionResult<void>> {
    return academyAction('quiz_bank.save', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const parsed = z.array(questionSchema).max(300).parse(questions)
        const { error } = await client.rpc('academy_replace_quiz', { p_course_id: z.uuid().parse(courseId), p_questions: parsed })
        assertDatabaseResult(error)
        revalidatePath(`/learning/tworze/${courseId}/test`)
    })
}

export async function saveQuizSettings(courseId: string, settings: z.input<typeof settingsSchema>): Promise<ActionResult<void>> {
    return academyAction('quiz_bank.settings', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const id = z.uuid().parse(courseId)
        const { attempt_limit, attempt_window_hours, ...rules } = settingsSchema.parse(settings)
        const { error } = await client.rpc('academy_update_course', { p_course_id: id, p_patch: { completion_rules: rules } })
        assertDatabaseResult(error)
        const { error: policyError } = await client.rpc('academy_set_quiz_attempt_policy', { p_course_id: id, p_limit: attempt_limit, p_window_hours: attempt_window_hours })
        if (isMissingDatabaseObject(policyError)) throw new Error(MIGRATION_PENDING_PL)
        assertDatabaseResult(policyError)
        revalidatePath(`/learning/tworze/${courseId}/test`)
    })
}

export interface VoidImpact { attempts: number; gain_point: number; cross_threshold: number; lose_pass: number; new_passes: number; pool_after: number }

export async function previewVoidQuestion(questionId: string): Promise<ActionResult<VoidImpact>> {
    return academyAction('quiz_bank.void_preview', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_preview_void_question', { p_question_id: z.uuid().parse(questionId) })
        assertDatabaseResult(error)
        return data as VoidImpact
    })
}

export async function voidQuestion(courseId: string, questionId: string, reason: string): Promise<ActionResult<{ recalculated: number; completions_closed: number }>> {
    return academyAction('quiz_bank.void', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_void_question', { p_question_id: z.uuid().parse(questionId), p_reason: z.string().trim().min(5).max(2000).parse(reason) })
        assertDatabaseResult(error)
        revalidatePath(`/learning/tworze/${courseId}/test`)
        return data as { recalculated: number; completions_closed: number }
    })
}
