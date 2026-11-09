'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { chatJSON } from '@/lib/ai/llm'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { aiDraftsEnabled, generateQuestionDrafts, MATERIAL_MAX_CHARS, type ChatJson } from '@/lib/academy/question-draft'
import type { ActionResult } from '@/lib/types/learning'

export interface QuestionDraftRow {
    id: string
    source_label: string
    source_excerpt: string
    question_text: string
    topic_tag: string | null
    options: { option_text: string; is_correct: boolean; explanation?: string | null }[]
    critique: { level?: string; clarity?: string; risk?: string | null; note?: string | null }
    status: 'pending' | 'approved' | 'rejected'
    decided_at: string | null
}
export type QuestionDraftsResult = { awaitingMigration: true; enabled: boolean } | { awaitingMigration: false; enabled: boolean; drafts: QuestionDraftRow[] }

export async function listQuestionDrafts(courseId: string): Promise<ActionResult<QuestionDraftsResult>> {
    return academyAction('question_drafts.list', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const enabled = aiDraftsEnabled()
        const { data, error } = await client.from('academy_question_drafts').select('id,source_label,source_excerpt,question_text,topic_tag,options,critique,status,decided_at').eq('course_id', z.uuid().parse(courseId)).order('created_at').limit(200)
        if (isMissingDatabaseObject(error)) return { awaitingMigration: true as const, enabled }
        assertDatabaseResult(error)
        return { awaitingMigration: false as const, enabled, drafts: (data ?? []) as QuestionDraftRow[] }
    })
}

export async function createQuestionDrafts(courseId: string, input: { sourceLabel: string; material: string; count: number; confirmedNoParticipantVoices: boolean }): Promise<ActionResult<{ saved: number; rejected: number }>> {
    return academyAction('question_drafts.generate', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        if (!aiDraftsEnabled()) throw new Error('Szkice z AI są wyłączone do decyzji o przekazaniu treści.')
        const id = z.uuid().parse(courseId)
        const parsed = z.object({ sourceLabel: z.string().trim().min(1).max(200), material: z.string().trim().min(50).max(MATERIAL_MAX_CHARS), count: z.number().int().min(1).max(15), confirmedNoParticipantVoices: z.literal(true) }).parse(input)
        const { data: canManage, error: manageError } = await client.rpc('academy_can_manage_course', { p_course_id: id })
        assertDatabaseResult(manageError)
        if (canManage !== true) throw new Error('Nie masz uprawnień do edycji tego szkolenia.')
        const { drafts, rejected } = await generateQuestionDrafts(chatJSON as ChatJson, parsed)
        if (drafts.length === 0) return { saved: 0, rejected }
        const { data, error } = await client.rpc('academy_save_question_drafts', { p_course_id: id, p_drafts: drafts, p_model: 'sonnet' })
        assertDatabaseResult(error)
        revalidatePath(`/learning/tworze/${id}/szkice-ai`)
        return { saved: data as number, rejected }
    })
}

export async function decideQuestionDraft(courseId: string, draftId: string, approve: boolean, options: { reason?: string; edited?: { question_text: string; options: QuestionDraftRow['options'] } } = {}): Promise<ActionResult<{ status: string }>> {
    return academyAction('question_drafts.decide', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_decide_question_draft', { p_draft_id: z.uuid().parse(draftId), p_approve: z.boolean().parse(approve), p_reason: options.reason ?? null, p_edited: options.edited ?? null })
        assertDatabaseResult(error)
        revalidatePath(`/learning/tworze/${z.uuid().parse(courseId)}/szkice-ai`)
        return data as { status: string }
    })
}
