import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { requireAcademyContext } from '@/lib/academy/server'
import { listProgrammeValidity, setProgrammeValidity } from '../academy-programme-validity'

const id = '11111111-1111-4111-8111-111111111111'
const rpc = vi.fn()
const order = vi.fn()
const client = { rpc, from: () => ({ select: () => ({ order }) }) }

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAcademyContext).mockResolvedValue({ client, access: { userId: 'a', isAdmin: true } } as never)
    rpc.mockResolvedValue({ data: null, error: null })
})

describe('setProgrammeValidity', () => {
    it('refuses a non-admin before touching the database', async () => {
        vi.mocked(requireAcademyContext).mockRejectedValue(new Error('Ta operacja wymaga uprawnień administratora.'))
        await expect(setProgrammeValidity(id, 12)).resolves.toEqual({ success: false, error: 'Ta operacja wymaga uprawnień administratora.' })
        expect(requireAcademyContext).toHaveBeenCalledWith({ admin: true })
        expect(rpc).not.toHaveBeenCalled()
    })

    it.each([0, 121, 1.5])('rejects %s months', async months => {
        const result = await setProgrammeValidity(id, months)
        expect(result.success).toBe(false)
        expect(rpc).not.toHaveBeenCalled()
    })

    it('rejects a malformed identifier', async () => {
        expect((await setProgrammeValidity('x', 12)).success).toBe(false)
        expect(rpc).not.toHaveBeenCalled()
    })

    it('saves a term and clears it to unlimited', async () => {
        await expect(setProgrammeValidity(id, 12)).resolves.toEqual({ success: true, data: null })
        expect(rpc).toHaveBeenLastCalledWith('academy_set_programme_validity', { p_programme_id: id, p_months: 12 })
        await setProgrammeValidity(id, null)
        expect(rpc).toHaveBeenLastCalledWith('academy_set_programme_validity', { p_programme_id: id, p_months: null })
    })

    it('says the migration is pending when the RPC does not exist', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        const result = await setProgrammeValidity(id, 12)
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toContain('czeka na migrację')
    })
})

describe('listProgrammeValidity', () => {
    it('reports an unmigrated column as waiting, not as an empty list of programmes', async () => {
        order.mockResolvedValue({ data: null, error: { code: '42703', message: 'x' } })
        await expect(listProgrammeValidity()).resolves.toEqual({ success: true, data: { migrated: false, programmes: [] } })
    })

    it('does not turn a failed read into an empty list', async () => {
        order.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
        expect((await listProgrammeValidity()).success).toBe(false)
    })
})
