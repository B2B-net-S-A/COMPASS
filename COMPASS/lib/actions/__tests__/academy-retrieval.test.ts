import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: vi.fn() }))

import { requireAcademyContext } from '@/lib/academy/server'
import { answerRetrieval, listMyRetrievals, openRetrieval } from '../academy-retrieval'

const id = '11111111-1111-4111-8111-111111111111'
const q = '22222222-2222-4222-8222-222222222222'
const o = '33333333-3333-4333-8333-333333333333'
const rpc = vi.fn()
const client = { rpc, from: vi.fn() }

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ACADEMY_RETRIEVAL_ENABLED', 'true')
    vi.mocked(requireAcademyContext).mockResolvedValue({ client, access: { userId: 'u1' } } as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('powtórki za przełącznikiem', () => {
    it.each([
        ['listMyRetrievals', () => listMyRetrievals()],
        ['openRetrieval', () => openRetrieval(id)],
        ['answerRetrieval', () => answerRetrieval(id, q, o)],
    ])('%s is refused while the switch is off, before any database call', async (_name, action) => {
        vi.stubEnv('ACADEMY_RETRIEVAL_ENABLED', 'false')
        await expect(action()).resolves.toEqual({ success: false, error: 'Powtórki nie są jeszcze włączone.' })
        expect(requireAcademyContext).not.toHaveBeenCalled()
        expect(rpc).not.toHaveBeenCalled()
    })

    it('refuses somebody else’s retrieval without revealing that it exists', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'retrieval_not_found' } })
        await expect(openRetrieval(id)).resolves.toEqual({ success: false, error: 'Ta powtórka nie istnieje lub nie jest Twoja.' })
    })

    it('rejects malformed identifiers without calling the database', async () => {
        expect((await openRetrieval('x')).success).toBe(false)
        expect((await answerRetrieval(id, 'x', o)).success).toBe(false)
        expect(rpc).not.toHaveBeenCalled()
    })

    it('explains a retrieval that is not due yet', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'retrieval_not_due' } })
        await expect(openRetrieval(id)).resolves.toEqual({ success: false, error: 'Ta powtórka nie jest jeszcze dostępna.' })
    })

    it('says the migration is pending', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        const result = await answerRetrieval(id, q, o)
        expect(!result.success && result.error).toContain('czeka na migrację')
    })

    it('passes the answer to the database, which alone knows the key', async () => {
        rpc.mockResolvedValue({ data: { selected_option_id: o, correct_option_id: o, explanation: 'Bo tak', completed: false }, error: null })
        await expect(answerRetrieval(id, q, o)).resolves.toMatchObject({ success: true, data: { correct_option_id: o } })
        expect(rpc).toHaveBeenCalledWith('academy_retrieval_answer', { p_schedule_id: id, p_question_id: q, p_option_id: o })
    })
})
