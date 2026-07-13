import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '../route'

describe('GET /api/livez', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
        process.env = { ...originalEnv }
    })

    it('reports only process liveness and immutable release SHA', async () => {
        process.env.GIT_SHA = 'b'.repeat(40)
        process.env.BUILT_AT = '2026-07-13T10:20:30Z'

        const response = GET()

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
        expect(await response.json()).toEqual({
            status: 'alive',
            version: 'b'.repeat(40),
        })
    })

    it('stays alive even when release metadata is missing', async () => {
        delete process.env.GIT_SHA
        delete process.env.BUILT_AT

        const response = GET()

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            status: 'alive',
            version: 'unknown',
        })
    })
})
