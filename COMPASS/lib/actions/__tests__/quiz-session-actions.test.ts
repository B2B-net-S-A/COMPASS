import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'
import { academyFixture, enrollmentRow, ATTEMPT, COURSE, ENROLLMENT, OPTION, QUESTION } from './academy-fixtures'
import { MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { finishQuizAttempt, getQuizAttemptResult, getQuizStatus, saveQuizAnswer, startQuizAttempt } from '../course-learning'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() }, logCompat: { error: vi.fn() } }))
const setup = (config: MockSupabaseConfig = {}) => { client = academyFixture({ ...config, tables: { academy_user_capabilities: [], course_enrollments: [enrollmentRow()], ...config.tables }, rpcs: { ...config.rpcs } }) }
// Wspólny mock gubi kod błędu, a tu liczy się właśnie PGRST202 (PostgREST nie zna funkcji).
const withMissing = (name: string) => {
    setup()
    const original = client.rpc.getMockImplementation()!
    client.rpc.mockImplementation(async (called: string, args?: Record<string, unknown>) =>
        called === name ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : original(called, args))
}
const fail = (message: string) => () => { throw new Error(message) }
const answers = [{ question_id: QUESTION, selected_option_id: OPTION }]

beforeEach(() => setup())

describe('brak migracji sesji podejścia', () => {
    it('status zwraca null, więc strona zostaje przy dotychczasowym quizie', async () => {
        withMissing('academy_quiz_status')
        expect(await getQuizStatus(COURSE, ENROLLMENT)).toEqual({ success: true, data: null })
    })

    it('wynik zwraca null zamiast awarii', async () => {
        withMissing('academy_quiz_attempt_result')
        expect(await getQuizAttemptResult(ATTEMPT)).toEqual({ success: true, data: null })
    })

    it('start mówi o czekaniu na migrację bez nazw technicznych', async () => {
        withMissing('academy_start_quiz_attempt')
        expect(await startQuizAttempt(COURSE, ENROLLMENT)).toEqual({ success: false, error: MIGRATION_PENDING_PL })
    })
})

describe('odmowy', () => {
    it.each([
        ['status', () => getQuizStatus(COURSE, ENROLLMENT)],
        ['start', () => startQuizAttempt(COURSE, ENROLLMENT)],
        ['autozapis', () => saveQuizAnswer(ATTEMPT, QUESTION, OPTION)],
        ['wysyłka', () => finishQuizAttempt(ATTEMPT, answers)],
        ['wynik', () => getQuizAttemptResult(ATTEMPT)],
    ])('%s wymaga zalogowania', async (_name, action) => {
        setup({ user: null })
        expect((await action()).success).toBe(false)
    })

    it('odrzuca identyfikatory spoza formatu przed wywołaniem bazy', async () => {
        expect((await saveQuizAnswer('zle', QUESTION, OPTION)).success).toBe(false)
        expect((await finishQuizAttempt(ATTEMPT, [{ question_id: 'zle', selected_option_id: OPTION }])).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_save_quiz_answer', expect.anything())
    })

    it('odrzuca nieznany rodzaj próby', async () => {
        expect((await startQuizAttempt(COURSE, ENROLLMENT, 'inny' as 'final')).success).toBe(false)
    })

    it('odpowiedź po czasie nie pokazuje kodu technicznego', async () => {
        setup({ rpcs: { academy_save_quiz_answer: fail('quiz_attempt_deadline_passed') } })
        const result = await saveQuizAnswer(ATTEMPT, QUESTION, OPTION)
        expect(result.success).toBe(false)
        expect(JSON.stringify(result)).not.toContain('quiz_attempt_deadline_passed')
    })
})

describe('ścieżka podstawowa', () => {
    it('start przekazuje zapis i rodzaj próby', async () => {
        const session = { attempt_id: ATTEMPT, questions: [] }
        setup({ rpcs: { academy_start_quiz_attempt: () => session } })
        expect(await startQuizAttempt(COURSE, ENROLLMENT, 'pre')).toEqual({ success: true, data: session })
        expect(client.rpc).toHaveBeenCalledWith('academy_start_quiz_attempt', { p_enrollment_id: ENROLLMENT, p_kind: 'pre' })
    })

    it('wysyłka przekazuje odpowiedzi i nie czyta klucza z tabel', async () => {
        setup({ rpcs: { academy_submit_quiz_attempt: () => ({ attempt_id: ATTEMPT, passed: true }) } })
        expect((await finishQuizAttempt(ATTEMPT, answers)).success).toBe(true)
        expect(client.rpc).toHaveBeenCalledWith('academy_submit_quiz_attempt', { p_attempt_id: ATTEMPT, p_answers: answers })
        expect(client.from).not.toHaveBeenCalledWith('course_quiz_options')
    })
})
