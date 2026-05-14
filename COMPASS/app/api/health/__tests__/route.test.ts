import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

describe('GET /api/health', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
        process.env.GIT_SHA = 'abc1234'
        process.env.BUILT_AT = '2026-04-29T12:00:00Z'
    })

    afterEach(() => {
        process.env = { ...originalEnv }
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('returns HTTP 200 when Supabase is reachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
        const response = await GET()
        expect(response.status).toBe(200)
    })

    it('returns standard healthcheck shape', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
        const response = await GET()
        const body = await response.json()
        expect(body).toMatchObject({
            status: 'healthy',
            version: 'abc1234',
            deployedAt: '2026-04-29T12:00:00Z',
            checks: { supabase: 'healthy' },
        })
    })

    it('returns HTTP 503 + status: unhealthy when Supabase is down', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(503)
        expect(body.status).toBe('unhealthy')
        expect(body.checks.supabase).toBe('unhealthy')
    })

    it('treats Supabase 4xx (auth-rejected HEAD) as healthy — service alive', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body.status).toBe('healthy')
        expect(body.checks.supabase).toBe('healthy')
    })

    it('returns unhealthy when fetch throws (network error or timeout)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(503)
        expect(body.checks.supabase).toBe('unhealthy')
    })

    it('returns unhealthy when env vars are missing', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL
        const response = await GET()
        const body = await response.json()
        expect(body.checks.supabase).toBe('unhealthy')
    })

    it('falls back to "unknown" when GIT_SHA / BUILT_AT not set', async () => {
        delete process.env.GIT_SHA
        delete process.env.BUILT_AT
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
        const response = await GET()
        const body = await response.json()
        expect(body.version).toBe('unknown')
        expect(body.deployedAt).toBe('unknown')
    })

    it('the route is force-dynamic (NEVER cached) and runs on nodejs runtime', async () => {
        const mod = await import('../route')
        expect((mod as { dynamic: string }).dynamic).toBe('force-dynamic')
        expect((mod as { runtime: string }).runtime).toBe('nodejs')
    })
})
