'use server'

import { z } from 'zod'
import { academyActionError, academyDatabaseError } from '@/lib/academy/errors'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { requireAcademyContext } from '@/lib/academy/server'
import { isAcademySwitchOn } from '@/lib/academy/switches'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'

const uuid = z.uuid()
const OFF_MESSAGE = 'Powtórki nie są jeszcze włączone.'

export interface RetrievalReveal { selected_option_id: string; correct_option_id: string; explanation: string | null }
export interface RetrievalQuestion { id: string; text: string; options: Array<{ id: string; text: string }>; answer: RetrievalReveal | null }
export interface RetrievalSession { id: string; offset_days: number; completed: boolean; questions: RetrievalQuestion[] }
export interface RetrievalListItem { id: string; offset_days: number; due_at: string; completed_at: string | null; course_title: string }

async function requireRetrieval() {
    if (!isAcademySwitchOn('ACADEMY_RETRIEVAL_ENABLED')) throw new ExpectedError(OFF_MESSAGE)
    try { return await requireAcademyContext() }
    catch (error) { throw new ExpectedError(academyActionError(error)) }
}

function refuse(error: { code?: string; message: string }): never {
    if (isMissingDatabaseObject(error)) throw new ExpectedError(MIGRATION_PENDING_PL)
    if (error.message === 'retrieval_not_found' || error.code === '42501') throw new ExpectedError('Ta powtórka nie istnieje lub nie jest Twoja.')
    if (error.message === 'retrieval_not_due') throw new ExpectedError('Ta powtórka nie jest jeszcze dostępna.')
    if (error.message === 'retrieval_no_questions') throw new ExpectedError('W tym szkoleniu nie ma już pytań do powtórki.')
    if (error.message === 'retrieval_question_invalid') throw new ExpectedError('Odpowiedź nie pasuje do tej powtórki. Odśwież stronę.')
    throw new ExpectedError(academyDatabaseError(error))
}

export async function listMyRetrievals(): Promise<ActionResult<RetrievalListItem[]>> {
    return runAction('listMyRetrievals', async () => {
        const { client, access } = await requireRetrieval()
        const { data, error } = await client.from('academy_retrieval_schedule').select('id,offset_days,due_at,completed_at,course_id').eq('user_id', access.userId).lte('due_at', new Date().toISOString()).order('due_at', { ascending: false }).limit(50)
        if (error) refuse(error)
        if (data === null) throw new Error('Brak odpowiedzi przy odczycie powtórek')
        // DEKORACJA: bez tytułów lista działa dalej, z nazwą ogólną.
        const ids = Array.from(new Set(data.map(row => row.course_id as string)))
        const titles = ids.length ? await client.from('courses').select('id,title').in('id', ids) : { data: [] as Array<{ id: string; title: string }> }
        const byId = new Map((titles.data ?? []).map(course => [course.id as string, course.title as string]))
        return data.map(row => ({ id: row.id as string, offset_days: row.offset_days as number, due_at: row.due_at as string, completed_at: row.completed_at as string | null, course_title: byId.get(row.course_id as string) ?? 'Szkolenie' }))
    })
}

export async function openRetrieval(id: string): Promise<ActionResult<RetrievalSession>> {
    return runAction('openRetrieval', async () => {
        const { client } = await requireRetrieval()
        const parsed = uuid.safeParse(id)
        if (!parsed.success) throw new ExpectedError('Nieprawidłowy identyfikator powtórki.')
        const { data, error } = await client.rpc('academy_retrieval_open', { p_schedule_id: parsed.data })
        if (error) refuse(error)
        return data as RetrievalSession
    })
}

export async function answerRetrieval(id: string, questionId: string, optionId: string): Promise<ActionResult<RetrievalReveal & { completed: boolean }>> {
    return runAction('answerRetrieval', async () => {
        const { client } = await requireRetrieval()
        const parsed = z.tuple([uuid, uuid, uuid]).safeParse([id, questionId, optionId])
        if (!parsed.success) throw new ExpectedError('Nieprawidłowa odpowiedź. Odśwież stronę.')
        const { data, error } = await client.rpc('academy_retrieval_answer', { p_schedule_id: parsed.data[0], p_question_id: parsed.data[1], p_option_id: parsed.data[2] })
        if (error) refuse(error)
        return data as RetrievalReveal & { completed: boolean }
    })
}
