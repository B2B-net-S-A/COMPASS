import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => {
    const chain: any = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.ilike = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.single = vi.fn(async () => ({ data: null, error: null }))
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
    chain.insert = vi.fn(async () => ({ error: null }))
    chain.upsert = vi.fn(async () => ({ error: null }))
    chain.then = (resolve: (v: { data: any; error: any }) => void) => resolve({ data: [], error: null })
    return {
        createClient: vi.fn(() => ({
            rpc: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: { message: 'exec_sql missing' } })),
            })),
            from: vi.fn(() => chain),
        })),
    }
})

beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret'
})

afterEach(() => {
    vi.clearAllMocks()
    delete process.env.CRON_SECRET
})

function makeRequest(opts: { bearer?: string; querySecret?: string } = {}): Request {
    const url = new URL('https://compass.test/api/migrate-compliance')
    if (opts.querySecret) url.searchParams.set('secret', opts.querySecret)
    const headers = new Headers()
    if (opts.bearer) headers.set('authorization', `Bearer ${opts.bearer}`)
    return new Request(url, { headers })
}

describe('GET /api/migrate-compliance', () => {
    it('returns 401 when Bearer header is missing', async () => {
        const { GET } = await import('../route')
        const response = await GET(makeRequest())
        expect(response.status).toBe(401)
        const body = await response.json()
        expect(body.error).toMatch(/Unauthorized/i)
    })

    it('returns 401 when secret does not match CRON_SECRET', async () => {
        const { GET } = await import('../route')
        const response = await GET(makeRequest({ bearer: 'wrong-secret' }))
        expect(response.status).toBe(401)
    })

    it('returns 401 when a valid secret is passed only in the query string', async () => {
        const { GET } = await import('../route')
        const response = await GET(makeRequest({ querySecret: 'super-secret' }))
        expect(response.status).toBe(401)
    })

    it('returns 503 when CRON_SECRET is not configured', async () => {
        delete process.env.CRON_SECRET
        const { GET } = await import('../route')
        const response = await GET(makeRequest({ bearer: 'super-secret' }))
        expect(response.status).toBe(503)
    })

    it('returns 500 when SUPABASE config is missing', async () => {
        const orig = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
        delete process.env.NEXT_PUBLIC_SUPABASE_URL
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        const { GET } = await import('../route')
        const response = await GET(makeRequest({ bearer: 'super-secret' }))
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body.error).toMatch(/Missing Supabase config/i)
        process.env.NEXT_PUBLIC_SUPABASE_URL = orig.url
        process.env.SUPABASE_SERVICE_ROLE_KEY = orig.key
    })

    it('uses CRON_SECRET from environment for the comparison (case-sensitive)', async () => {
        process.env.CRON_SECRET = 'CaseSensitiveSecret'
        const { GET } = await import('../route')
        const wrong = await GET(makeRequest({ bearer: 'casesensitivesecret' }))
        expect(wrong.status).toBe(401)
        // (We don't assert success path here — full DB seeding requires a real Postgres.)
    })
})
