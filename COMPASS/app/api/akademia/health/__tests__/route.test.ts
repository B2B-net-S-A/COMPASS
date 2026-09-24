import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    load: vi.fn(),
    client: vi.fn(() => ({})),
}))
vi.mock('@/lib/academy/operations-health-server', () => ({ loadAcademyOperationsHealth: mocks.load }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: mocks.client }))

async function route() {
    return import('../route')
}

describe('public Academy health', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-09-24T10:00:00Z'))
        mocks.load.mockReset()
        mocks.client.mockClear()
    })

    afterEach(() => vi.useRealTimers())

    it.each([
        ['healthy', 200],
        ['degraded', 200],
        ['unhealthy', 503],
    ] as const)('returns only coarse %s status, HTTP %i, and no-store', async (status, code) => {
        mocks.load.mockResolvedValue({ status, alerts: [{ code: 'private', message: 'internal details' }], materials: { pending: 42 } })
        const { GET } = await route()
        const response = await GET()
        expect(response.status).toBe(code)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(await response.json()).toEqual({ status })
    })

    it('fails closed without leaking an exception or environment details', async () => {
        mocks.load.mockRejectedValue(new Error('sensitive database error'))
        const { GET } = await route()
        const response = await GET()
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ status: 'unhealthy' })
    })

    it('coalesces concurrent probes and limits repeat work to once per 30 seconds', async () => {
        let finish!: (value: { status: string }) => void
        mocks.load.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
        const { GET } = await route()
        const first = GET()
        const second = GET()
        expect(mocks.load).toHaveBeenCalledTimes(1)
        finish({ status: 'healthy' })
        expect((await first).status).toBe(200)
        expect((await second).status).toBe(200)
        await GET()
        expect(mocks.load).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(30_001)
        mocks.load.mockResolvedValue({ status: 'degraded' })
        expect((await (await GET()).json())).toEqual({ status: 'degraded' })
        expect(mocks.load).toHaveBeenCalledTimes(2)
    })

    it('is dynamic and uses the Node runtime for the internal scanner probe', async () => {
        const mod = await route()
        expect(mod.dynamic).toBe('force-dynamic')
        expect(mod.runtime).toBe('nodejs')
    })
})
