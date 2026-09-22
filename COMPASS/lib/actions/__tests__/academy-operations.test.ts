import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ context: vi.fn(), service: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: mocks.context, academyAction: async (_event: string, action: () => Promise<unknown>) => { try { return { success: true, data: await action() } } catch { return { success: false, error: 'denied' } } } }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: mocks.service }))
vi.mock('@/lib/academy/operations-health-server', () => ({ loadAcademyOperationsHealth: mocks.load }))
import { getAcademyOperationsHealth } from '../academy-operations'
describe('Academy operational metadata boundary', () => {
    beforeEach(() => vi.resetAllMocks())
    it('never creates privileged client or probes scanner when admin guard fails', async () => {
        mocks.context.mockRejectedValue(new Error('denied'))
        expect((await getAcademyOperationsHealth()).success).toBe(false)
        expect(mocks.context).toHaveBeenCalledWith({ admin: true })
        expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled()
    })
    it('loads aggregate health only after authorized context', async () => {
        mocks.context.mockResolvedValue({}); const client = {}; mocks.service.mockReturnValue(client); mocks.load.mockResolvedValue({ status: 'healthy' })
        expect(await getAcademyOperationsHealth()).toEqual({ success: true, data: { status: 'healthy' } })
        expect(mocks.load).toHaveBeenCalledWith(client)
    })
})
