import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), hold: vi.fn(), service: vi.fn(), sendEmail: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: mocks.service }))
vi.mock('@/lib/academy/server', () => ({
    requireAcademyContext: mocks.context,
    academyAction: async (_: string, action: () => Promise<unknown>) => { try { return { success: true, data: await action() } } catch (error) { return { success: false, error: (error as Error).message } } },
    assertDatabaseResult: (error: { message: string } | null) => { if (error) throw new Error(error.message) },
}))
vi.mock('@/lib/academy/outbound', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/academy/outbound')>()), holdAcademyMail: mocks.hold }))

import { saveAcademyRunAudience } from '../academy-run-audience'

const runId = '00000000-0000-4000-8000-000000000001'
const future = new Date(Date.now() + 7 * 86_400_000).toISOString()
const run = { id: runId, canManage: true, status: 'published', courseTitle: 'PEGA', title: 'Grupa', sessions: [{ status: 'scheduled', startsAt: future, timeZone: 'Europe/Warsaw' }] }
const input = { runId, filter: { includeNexus: true, includeOffice: false, clients: [] }, excluded: [] as string[] }

function serviceClient(contracts: unknown[], queued: unknown[] = []) {
    const update = vi.fn(() => ({ in: async () => ({ error: null }) }))
    const builder = (table: string) => {
        const chain: Record<string, unknown> = {}
        for (const method of ['select', 'not', 'in', 'eq']) chain[method] = () => chain
        chain.limit = async () => ({ data: table === 'nexus_contract_snapshot' ? contracts : table === 'profiles' ? [] : queued, error: null })
        chain.update = update
        return chain
    }
    return { from: builder, update }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockImplementation(async (name: string) => name === 'academy_list_runs' ? { data: [run], error: null } : { data: 'id', error: null })
    mocks.context.mockResolvedValue({ client: { rpc: mocks.rpc } })
    mocks.hold.mockResolvedValue({ status: 'held', id: 'x' })
    mocks.service.mockReturnValue(serviceClient([{ email: 'A@example.test', name: 'Anna', lastname: 'Nowak', client_name: 'Bank', end_date: null }]))
})

describe('saveAcademyRunAudience', () => {
    it('records the choice and creates held rows without sending anything', async () => {
        expect(await saveAcademyRunAudience(input)).toEqual({ success: true, data: { count: 1, held: 1, duplicates: 0, withdrawn: 0 } })
        expect(mocks.rpc).toHaveBeenCalledWith('academy_record_run_audience', expect.objectContaining({ p_run_id: runId, p_count: 1 }))
        expect(mocks.hold).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'academy.run_invitation', recipient: 'a@example.test', runId, dedupeKey: `run_invitation:${runId}:a@example.test` }))
        expect(mocks.sendEmail).not.toHaveBeenCalled()
    })
    it('skips consultants whose contract already ended', async () => {
        mocks.service.mockReturnValue(serviceClient([{ email: 'old@example.test', name: 'X', lastname: 'Y', client_name: 'Bank', end_date: '2020-01-01' }]))
        expect(await saveAcademyRunAudience(input)).toEqual({ success: false, error: 'Te filtry nie wskazują żadnej osoby.' })
        expect(mocks.hold).not.toHaveBeenCalled()
    })
    it('withdraws queued people no longer in the audience', async () => {
        const service = serviceClient([{ email: 'a@example.test', name: 'A', lastname: 'B', client_name: null, end_date: null }], [{ id: 'old', recipient: 'gone@example.test' }, { id: 'kept', recipient: 'a@example.test' }])
        mocks.service.mockReturnValue(service)
        const result = await saveAcademyRunAudience(input)
        expect(result.success && result.data.withdrawn).toBe(1)
        expect(service.update).toHaveBeenCalledWith({ status: 'expired' })
    })
    it('counts a repeat as a duplicate, not as a new message', async () => {
        mocks.hold.mockResolvedValue({ status: 'duplicate' })
        const result = await saveAcademyRunAudience(input)
        expect(result.success && result.data).toMatchObject({ held: 0, duplicates: 1 })
    })
    it('refuses after the first session and for an unpublished edition', async () => {
        mocks.rpc.mockResolvedValue({ data: [{ ...run, sessions: [{ status: 'scheduled', startsAt: '2020-01-01T00:00:00Z', timeZone: 'UTC' }] }], error: null })
        expect((await saveAcademyRunAudience(input)).success).toBe(false)
        mocks.rpc.mockResolvedValue({ data: [{ ...run, status: 'draft' }], error: null })
        expect(await saveAcademyRunAudience(input)).toEqual({ success: false, error: 'Adresatów wybiera się dla opublikowanej edycji.' })
        expect(mocks.hold).not.toHaveBeenCalled()
    })
    it('reports the pending migration and holds nothing', async () => {
        mocks.rpc.mockImplementation(async (name: string) => name === 'academy_list_runs' ? { data: [run], error: null } : { data: null, error: { code: 'PGRST202', message: 'x' } })
        const result = await saveAcademyRunAudience(input)
        expect(result.success).toBe(false)
        expect(!result.success && result.error).toContain('migrację')
        expect(mocks.hold).not.toHaveBeenCalled()
    })
    it('stops when the queue cannot be written', async () => {
        mocks.hold.mockResolvedValue({ status: 'refused', reason: 'write_failed' })
        expect(await saveAcademyRunAudience(input)).toEqual({ success: false, error: 'Nie udało się zapisać kolejki zaproszeń. Nic nie zostało wysłane.' })
    })
    it('refuses someone without editor rights before reading any person', async () => {
        mocks.context.mockRejectedValue(new Error('Ta operacja wymaga uprawnień obsługi Akademii.'))
        expect((await saveAcademyRunAudience(input)).success).toBe(false)
        expect(mocks.service).not.toHaveBeenCalled()
    })
})
