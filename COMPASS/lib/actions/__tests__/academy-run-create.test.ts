import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/academy/server', () => ({
    requireAcademyContext: mocks.context,
    academyAction: async (_: string, action: () => Promise<unknown>) => { try { return { success: true, data: await action() } } catch (error) { return { success: false, error: (error as Error).message } } },
    assertDatabaseResult: (error: { message: string } | null) => { if (error) throw new Error(error.message) },
}))
vi.mock('@/lib/academy/db-worker', () => ({ academyManagedTeamsConfiguration: () => ({ managedTeamsAvailable: false, reason: 'Tor Teams jest wyłączony.' }), academyAttendanceRetentionConfiguration: () => ({}) }))

import { createAcademyRunWithFirstSession } from '../academy-sessions'

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const input = { courseId: id(1), versionId: id(2), title: 'Grupa lutowa', capacity: 20, session: { startsAt: '2027-02-16T09:00:00Z', endsAt: '2027-02-16T12:00:00Z', timeZone: 'Europe/Warsaw', mode: 'external_link' as const, externalJoinUrl: 'https://teams.microsoft.com/meet/123', organizerId: null } }
const called = () => mocks.rpc.mock.calls.map(call => call[0])

beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.mockResolvedValue({ client: { rpc: mocks.rpc } })
    mocks.rpc.mockImplementation(async (name: string) => name === 'academy_create_run' ? { data: id(9), error: null } : { data: id(8), error: null })
})

describe('createAcademyRunWithFirstSession', () => {
    it('creates the edition and its first required session from one submit', async () => {
        const result = await createAcademyRunWithFirstSession(input)
        expect(result).toEqual({ success: true, data: { runId: id(9), incomplete: null } })
        expect(called()).toEqual(['academy_create_run', 'academy_save_session'])
        expect(mocks.rpc.mock.calls[1][1].p_input).toMatchObject({ runId: id(9), title: 'Grupa lutowa', mode: 'external_link', required: true, organizerId: null })
    })
    it('assigns the extra trainer only to this edition', async () => {
        await createAcademyRunWithFirstSession({ ...input, trainerId: id(5) })
        expect(mocks.rpc).toHaveBeenLastCalledWith('academy_set_run_staff', { p_run_id: id(9), p_user_id: id(5), p_enabled: true })
    })
    it('leaves no draft behind when the link is wrong', async () => {
        const result = await createAcademyRunWithFirstSession({ ...input, session: { ...input.session, externalJoinUrl: 'http://example.test/x' } })
        expect(result).toEqual({ success: false, error: 'Podaj prawidłowy link spotkania Teams zaczynający się od https://.' })
        expect(mocks.rpc).not.toHaveBeenCalled()
    })
    it('refuses the managed Teams track while its switch is off, before creating anything', async () => {
        const result = await createAcademyRunWithFirstSession({ ...input, session: { ...input.session, mode: 'managed_teams', externalJoinUrl: null, organizerId: id(4) } })
        expect(result).toEqual({ success: false, error: 'Tor Teams jest wyłączony.' })
        expect(mocks.rpc).not.toHaveBeenCalled()
    })
    it('refuses an end before the start and an unauthorized user', async () => {
        expect((await createAcademyRunWithFirstSession({ ...input, session: { ...input.session, endsAt: input.session.startsAt } })).success).toBe(false)
        mocks.context.mockRejectedValue(new Error('Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.'))
        expect(await createAcademyRunWithFirstSession(input)).toEqual({ success: false, error: 'Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.' })
        expect(mocks.rpc).not.toHaveBeenCalled()
    })
    it('reports a run without a session instead of a generic failure', async () => {
        mocks.rpc.mockImplementation(async (name: string) => name === 'academy_create_run' ? { data: id(9), error: null } : { data: null, error: { message: 'boom' } })
        const result = await createAcademyRunWithFirstSession(input)
        expect(result).toEqual({ success: true, data: { runId: id(9), incomplete: 'Edycja powstała, ale nie udało się zapisać terminu. Dodaj spotkanie na ekranie edycji.' } })
    })
    it('reports a failed trainer assignment without losing the edition', async () => {
        mocks.rpc.mockImplementation(async (name: string) => name === 'academy_set_run_staff' ? { data: null, error: { message: 'boom' } } : { data: id(9), error: null })
        const result = await createAcademyRunWithFirstSession({ ...input, trainerId: id(5) })
        expect(result.success && result.data.incomplete).toContain('prowadzącego')
    })
    it('surfaces a refused create without touching sessions', async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Edycja wymaga zatwierdzonego szkolenia live lub mieszanego.' } })
        expect((await createAcademyRunWithFirstSession(input)).success).toBe(false)
        expect(called()).toEqual(['academy_create_run'])
    })
})
