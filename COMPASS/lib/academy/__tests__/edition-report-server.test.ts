import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { loadEditionReportEvidence } from '../edition-report-server'
import type { AcademyRunDTO, AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'

type Response = { data: unknown; error: { code?: string; message: string } | null }
const ok = (data: unknown): Response => ({ data, error: null })
const missing = (code = '42703'): Response => ({ data: null, error: { code, message: 'does not exist' } })
const denied: Response = { data: null, error: { code: '42501', message: 'permission denied' } }

/** Fake PostgREST: answers by table and selected columns, thenable at any chain step. */
function fakeClient(answer: (table: string, columns: string) => Response) {
    const seen: Array<{ table: string; columns: string }> = []
    const client = {
        from(table: string) {
            let columns = ''
            const chain: Record<string, unknown> = {
                select(value: string) { columns = value; seen.push({ table, columns }); return chain },
                then(resolve: (value: Response) => unknown) { return Promise.resolve(resolve(answer(table, columns))) },
            }
            for (const method of ['eq', 'in', 'order', 'limit', 'maybeSingle', 'single']) chain[method] = () => chain
            return chain
        },
    }
    return { client: client as unknown as SupabaseClient, seen }
}

const run = { id: 'run', courseId: 'course', versionId: 'version' } as AcademyRunDTO
const participants = [{ status: 'confirmed', enrollmentId: 'e1' }, { status: 'waitlisted', enrollmentId: 'e2' }] as AcademyRunParticipantDTO[]

function preMigrationAnswers(table: string, columns: string): Response {
    if (columns === 'kind' || columns === 'voided_at' || columns.includes('reports_start_at') || columns.includes('is_rehearsal')) return missing()
    if (table === 'academy_participation_documents') return missing('42P01')
    if (table === 'course_versions') return ok({ completion_rules: { quiz_required: true, quiz_pass_percent: '70' } })
    if (table === 'course_quiz_questions') return ok([{ id: 'q1', order_index: 0, question_text: 'Pytanie' }])
    if (table === 'course_quiz_options') return ok([{ id: 'o1', question_id: 'q1', option_text: 'A', is_correct: true }])
    if (table === 'course_quiz_attempts') return ok([])
    throw new Error('unexpected ' + table)
}

describe('loadEditionReportEvidence', () => {
    it('works on a database without the later migrations and does not ask for their columns', async () => {
        const { client, seen } = fakeClient(preMigrationAnswers)
        const evidence = await loadEditionReportEvidence(client, run, participants)
        expect(evidence).toMatchObject({ quizRequired: true, passPercent: 70, preTestTracked: false, voidingTracked: false, participationDocuments: null, reportsStartAt: null, rehearsalCourse: false })
        expect(seen.find(q => q.table === 'course_quiz_attempts' && q.columns.includes('score_percent'))?.columns).not.toContain('kind')
        expect(seen.find(q => q.table === 'course_quiz_questions' && q.columns.includes('order_index'))?.columns).not.toContain('voided_at')
    })

    it('treats the PostgREST schema-cache codes as not migrated', async () => {
        const { client } = fakeClient((table, columns) => columns === 'kind' ? missing('PGRST204') : table === 'academy_participation_documents' ? missing('PGRST205') : preMigrationAnswers(table, columns))
        await expect(loadEditionReportEvidence(client, run, participants)).resolves.toMatchObject({ preTestTracked: false, participationDocuments: null })
    })

    it('reads the new columns once they exist', async () => {
        const { client, seen } = fakeClient((table, columns) => {
            if (columns === 'kind' || columns === 'voided_at') return ok([])
            if (columns.includes('reports_start_at')) return ok({ reports_start_at: '2027-03-16T00:00:00Z' })
            if (columns.includes('is_rehearsal')) return ok({ is_rehearsal: true })
            if (table === 'academy_participation_documents') return ok([{ id: 'd1' }, { id: 'd2' }])
            return preMigrationAnswers(table, columns)
        })
        await expect(loadEditionReportEvidence(client, run, participants)).resolves.toMatchObject({ preTestTracked: true, voidingTracked: true, participationDocuments: 2, reportsStartAt: '2027-03-16T00:00:00Z', rehearsalCourse: true })
        expect(seen.find(q => q.table === 'course_quiz_attempts' && q.columns.includes('score_percent'))?.columns).toContain('kind')
        expect(seen.find(q => q.table === 'course_quiz_questions' && q.columns.includes('order_index'))?.columns).toContain('voided_at')
    })

    it('does not turn a denied or failed read of report content into an empty report', async () => {
        const { client } = fakeClient((table, columns) => table === 'course_quiz_attempts' && columns.includes('score_percent') ? denied : preMigrationAnswers(table, columns))
        await expect(loadEditionReportEvidence(client, run, participants)).rejects.toThrow('podejść do testu')
    })

    it('does not read a schema probe failure as a missing migration', async () => {
        const { client } = fakeClient((table, columns) => columns === 'kind' ? denied : preMigrationAnswers(table, columns))
        await expect(loadEditionReportEvidence(client, run, participants)).rejects.toThrow('schematu raportu')
    })

    it('fails a null response for questions rather than reporting no quiz', async () => {
        const { client } = fakeClient((table, columns) => table === 'course_quiz_questions' && columns.includes('order_index') ? ok(null) : preMigrationAnswers(table, columns))
        await expect(loadEditionReportEvidence(client, run, participants)).rejects.toThrow('pytań testu')
    })

    it('degrades the rehearsal date when RLS hides the settings from TCM', async () => {
        const { client } = fakeClient((table, columns) => columns.includes('reports_start_at') ? denied : preMigrationAnswers(table, columns))
        await expect(loadEditionReportEvidence(client, run, participants)).resolves.toMatchObject({ reportsStartAt: null })
    })
})
