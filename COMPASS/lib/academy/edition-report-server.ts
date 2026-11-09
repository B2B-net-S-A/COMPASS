import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { requireRows, selectInChunks } from '@/lib/supabase/select-in-chunks'
import type { AcademyRunDTO, AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import type { EditionAttemptEvidence, EditionOptionEvidence, EditionQuestionEvidence, EditionReportEvidence } from './edition-report'

type QueryError = { code?: string; message: string } | null
type QueryResult<T> = { data: T | null; error: QueryError }

// Code ships before its SQL, so a missing column or table means "waits for
// migration" (42703/42P01, or the PostgREST schema-cache variants), not a fault.
const NOT_MIGRATED = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

/** A probe of an object that a later migration adds: true/false for present/absent,
 * and any other failure is thrown, because it is not evidence of absence. */
async function isMigrated(query: PromiseLike<QueryResult<unknown>>): Promise<boolean> {
    const { error } = await query
    if (!error) return true
    if (NOT_MIGRATED.has(error.code ?? '')) return false
    throw new Error(`Nie udało się sprawdzić schematu raportu edycji: ${error.message}`)
}

/** DEKORACJA: the "rehearsal" label must degrade to rehearsal instead of hiding
 * the report. Absent date, absent column and denied RLS all mean the same here. */
async function readReportsStart(client: SupabaseClient): Promise<string | null> {
    const { data, error } = await client.from('academy_rollout_settings').select('reports_start_at').maybeSingle()
    if (error) {
        if (!NOT_MIGRATED.has(error.code ?? '')) logger.warn({ event: 'academy.edition_report.reports_start_unavailable', code: error.code })
        return null
    }
    return (data as { reports_start_at?: string | null } | null)?.reports_start_at ?? null
}

async function readRehearsalCourse(client: SupabaseClient, courseId: string): Promise<boolean> {
    const { data, error } = await client.from('courses').select('is_rehearsal').eq('id', courseId).maybeSingle()
    if (error) {
        if (!NOT_MIGRATED.has(error.code ?? '')) logger.warn({ event: 'academy.edition_report.rehearsal_flag_unavailable', code: error.code })
        return false
    }
    return (data as { is_rehearsal?: boolean } | null)?.is_rehearsal === true
}

async function readParticipationDocuments(client: SupabaseClient, runId: string): Promise<number | null> {
    const { data, error } = await client.from('academy_participation_documents').select('id').eq('run_id', runId)
    if (error && NOT_MIGRATED.has(error.code ?? '')) return null
    return requireRows('zaświadczeń udziału', { data: data as Array<{ id: string }> | null, error }).length
}

/** Reads the report's quiz and document evidence through the caller's session, so
 * RLS still decides what this account may see. Rows here are TREŚĆ of the report. */
export async function loadEditionReportEvidence(
    client: SupabaseClient,
    run: AcademyRunDTO,
    participants: AcademyRunParticipantDTO[],
): Promise<EditionReportEvidence> {
    const enrollmentIds = participants.filter(person => person.status === 'confirmed' && person.enrollmentId).map(person => person.enrollmentId as string)

    const [preTestTracked, voidingTracked, version] = await Promise.all([
        isMigrated(client.from('course_quiz_attempts').select('kind').limit(1)),
        isMigrated(client.from('course_quiz_questions').select('voided_at').limit(1)),
        client.from('course_versions').select('completion_rules').eq('id', run.versionId).single(),
    ])
    const [version0] = requireRows('reguł ukończenia', { data: version.data ? [version.data as { completion_rules: Record<string, unknown> | null }] : null, error: version.error })
    const rules = version0.completion_rules ?? {}
    const passPercent = Number(rules.quiz_pass_percent)

    const attemptColumns = `enrollment_id,answers,score_percent,passed,attempted_at${preTestTracked ? ',kind' : ''}`
    const questionColumns = `id,order_index,question_text${voidingTracked ? ',voided_at' : ''}`
    const [attempts, questionRows, participationDocuments, reportsStartAt, rehearsalCourse] = await Promise.all([
        selectInChunks<EditionAttemptEvidence>({
            source: 'podejść do testu', column: 'enrollment_id', ids: enrollmentIds,
            query: () => client.from('course_quiz_attempts').select(attemptColumns),
        }),
        client.from('course_quiz_questions').select(questionColumns).eq('version_id', run.versionId).order('order_index'),
        readParticipationDocuments(client, run.id),
        readReportsStart(client),
        readRehearsalCourse(client, run.courseId),
    ])
    const questions = requireRows('pytań testu', questionRows as unknown as { data: EditionQuestionEvidence[] | null; error: { message: string } | null })
    const options = await selectInChunks<EditionOptionEvidence>({
        source: 'odpowiedzi testu', column: 'question_id', ids: questions.map(question => question.id),
        query: () => client.from('course_quiz_options').select('id,question_id,option_text,is_correct'),
    })

    return {
        quizRequired: rules.quiz_required === true || rules.quiz_required === 'true',
        passPercent: Number.isFinite(passPercent) ? passPercent : null,
        attempts, questions, options, preTestTracked, voidingTracked, participationDocuments, reportsStartAt, rehearsalCourse,
    }
}
