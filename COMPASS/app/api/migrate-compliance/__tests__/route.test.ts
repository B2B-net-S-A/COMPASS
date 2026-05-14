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
})

function makeRequest(secret: string | null): Request {
    const url = secret ? `https://compass.test/api/migrate-compliance?secret=${secret}` : 'https://compass.test/api/migrate-compliance'
    return new Request(url)
}

describe('GET /api/migrate-compliance', () => {
    it('returns 401 when secret query param is missing', async () => {
        const { GET } = await import('../route')
        const response = await GET(makeRequest(null))
        expect(response.status).toBe(401)
        const body = await response.json()
        expect(body.error).toMatch(/Unauthorized/i)
    })

    it('returns 401 when secret does not match CRON_SECRET', async () => {
        const { GET } = await import('../route')
        const response = await GET(makeRequest('wrong-secret'))
        expect(response.status).toBe(401)
    })

    it('returns 500 when SUPABASE config is missing', async () => {
        const orig = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
        delete process.env.NEXT_PUBLIC_SUPABASE_URL
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        const { GET } = await import('../route')
        const response = await GET(makeRequest('super-secret'))
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body.error).toMatch(/Missing Supabase config/i)
        process.env.NEXT_PUBLIC_SUPABASE_URL = orig.url
        process.env.SUPABASE_SERVICE_ROLE_KEY = orig.key
    })

    it('uses CRON_SECRET from environment for the comparison (case-sensitive)', async () => {
        process.env.CRON_SECRET = 'CaseSensitiveSecret'
        const { GET } = await import('../route')
        const wrong = await GET(makeRequest('casesensitivesecret'))
        expect(wrong.status).toBe(401)
        // (We don't assert success path here — full DB seeding requires a real Postgres.)
    })
})
