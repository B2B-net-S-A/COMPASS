import { describe, expect, it } from 'vitest'
import { GET } from '../route'

describe('GET /api/health', () => {
    it('returns HTTP 200', async () => {
        const response = await GET()
        expect(response.status).toBe(200)
    })

    it('returns JSON with status: "ok"', async () => {
        const response = await GET()
        const body = await response.json()
        expect(body.status).toBe('ok')
    })

    it('includes a valid ISO timestamp', async () => {
        const response = await GET()
        const body = await response.json()
        expect(body.timestamp).toBeTruthy()
        const parsed = new Date(body.timestamp)
        expect(Number.isFinite(parsed.getTime())).toBe(true)
    })

    it('includes a non-negative uptime number (seconds)', async () => {
        const response = await GET()
        const body = await response.json()
        expect(typeof body.uptime).toBe('number')
        expect(body.uptime).toBeGreaterThanOrEqual(0)
    })

    it('the route is force-dynamic (NEVER cached) and runs on nodejs runtime', async () => {
        const mod = await import('../route')
        expect((mod as { dynamic: string }).dynamic).toBe('force-dynamic')
        expect((mod as { runtime: string }).runtime).toBe('nodejs')
    })
})
