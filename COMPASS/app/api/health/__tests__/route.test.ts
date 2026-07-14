import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

function supabaseResponse(status = 200, body: unknown = []) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('GET /api/health', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
        process.env.GIT_SHA = 'a'.repeat(40)
        process.env.BUILT_AT = '2026-04-29T12:00:00Z'
    })

    afterEach(() => {
        process.env = { ...originalEnv }
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('returns HTTP 200 when Supabase is reachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseResponse()))
        const response = await GET()
        expect(response.status).toBe(200)
    })

    it('returns standard healthcheck shape', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseResponse()))
        const response = await GET()
        const body = await response.json()
        expect(body).toMatchObject({
            status: 'healthy',
            version: 'a'.repeat(40),
            deployedAt: '2026-04-29T12:00:00Z',
            checks: {
                database: { status: 'healthy', critical: true },
                supabase: { status: 'healthy', critical: true },
                release: { status: 'healthy', critical: true },
            },
        })
        expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    })

    it('returns HTTP 503 + status: unhealthy when Supabase is down', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseResponse(500, { message: 'down' })))
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(503)
        expect(body.status).toBe('unhealthy')
        expect(body.checks.database.status).toBe('unhealthy')
        expect(body.checks.supabase).toEqual(body.checks.database)
    })

    it('fails closed when the database probe is rejected', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseResponse(401, { message: 'denied' })))
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(503)
        expect(body.status).toBe('unhealthy')
        expect(body.checks.database.status).toBe('unhealthy')
    })

    it('returns unhealthy when fetch throws (network error or timeout)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(503)
        expect(body.checks.database.status).toBe('unhealthy')
    })

    it('returns unhealthy when the private database credential is missing', async () => {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(503)
        expect(body.checks.database.status).toBe('unhealthy')
    })

    it('fails readiness when exact release metadata is missing', async () => {
        delete process.env.GIT_SHA
        delete process.env.BUILT_AT
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseResponse()))
        const response = await GET()
        const body = await response.json()
        expect(response.status).toBe(503)
        expect(body.version).toBe('unknown')
        expect(body.deployedAt).toBe('unknown')
        expect(body.checks.release).toEqual({ status: 'unhealthy', critical: true })
    })

    it('queries a known table with the server-only key and never caches the probe', async () => {
        const fetchMock = vi.fn().mockResolvedValue(supabaseResponse())
        vi.stubGlobal('fetch', fetchMock)

        await GET()

        expect(fetchMock).toHaveBeenCalledOnce()
        const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
        expect(url.toString()).toBe('https://test.supabase.co/rest/v1/profiles?select=id&limit=1')
        const headers = new Headers(init.headers)
        expect(init).toMatchObject({
            method: 'GET',
            cache: 'no-store',
            redirect: 'error',
        })
        expect(headers.get('apikey')).toBe('test-service-role-key')
        expect(headers.get('authorization')).toBe('Bearer test-service-role-key')
    })

    it('the route is force-dynamic (NEVER cached) and runs on nodejs runtime', async () => {
        const mod = await import('../route')
        expect((mod as { dynamic: string }).dynamic).toBe('force-dynamic')
        expect((mod as { runtime: string }).runtime).toBe('nodejs')
    })
})
