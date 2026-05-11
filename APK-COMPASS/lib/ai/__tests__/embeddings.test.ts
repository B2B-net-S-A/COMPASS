import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logCompat } from '@/lib/logger'
import { deterministicEmbedding, installVoyageFetchMock, resetVoyageMock, setVoyageMockBehavior } from '@/test/mocks/voyage'

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_KEY = process.env.VOYAGE_API_KEY

beforeEach(() => {
    resetVoyageMock()
    installVoyageFetchMock()
    process.env.VOYAGE_API_KEY = 'test-key'
})

afterEach(() => {
    global.fetch = ORIGINAL_FETCH
    if (ORIGINAL_KEY !== undefined) process.env.VOYAGE_API_KEY = ORIGINAL_KEY
})

describe('generateEmbedding', () => {
    it('returns 1024-dimensional vector on a successful call', async () => {
        const { generateEmbedding } = await import('../embeddings')
        const v = await generateEmbedding('hello world')
        expect(v).toHaveLength(1024)
        expect(v.every(n => typeof n === 'number')).toBe(true)
    })

    it('produces deterministic output for the same input (same hash → same vector)', async () => {
        const { generateEmbedding } = await import('../embeddings')
        const a = await generateEmbedding('the quick brown fox')
        const b = await generateEmbedding('the quick brown fox')
        expect(a).toEqual(b)
    })

    it('produces different vectors for different inputs', async () => {
        const { generateEmbedding } = await import('../embeddings')
        const a = await generateEmbedding('alpha')
        const b = await generateEmbedding('beta')
        expect(a).not.toEqual(b)
    })

    it('strips newlines and truncates input to 32_000 characters', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch')
        const { generateEmbedding } = await import('../embeddings')
        const longInput = 'a'.repeat(50_000) + '\nXY\nZ'
        await generateEmbedding(longInput)
        const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
        expect(body.input[0]).toHaveLength(32_000)
        expect(body.input[0]).not.toContain('\n')
    })

    it('passes correct model + output_dimension + input_type in the request body', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch')
        const { generateEmbedding } = await import('../embeddings')
        await generateEmbedding('x')
        const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
        expect(body.model).toBe('voyage-3-large')
        expect(body.output_dimension).toBe(1024)
        expect(body.input_type).toBe('document')
    })

    it('falls back to mock embedding when VOYAGE_API_KEY missing', async () => {
        delete process.env.VOYAGE_API_KEY
        vi.resetModules()
        // Phase 18.7: po resetModules musimy re-import logCompat — embeddings.ts
        // dostaje świeży moduł logger po reset, a stary `logCompat` z top-import
        // wskazuje na stary cached moduł (spy nie chwyta).
        const { logCompat: freshLogCompat } = await import('@/lib/logger')
        const warn = vi.spyOn(freshLogCompat, 'warn').mockImplementation(() => {})
        const { generateEmbedding } = await import('../embeddings')
        const v = await generateEmbedding('whatever')
        expect(v).toHaveLength(1024)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('VOYAGE_API_KEY missing'))
        warn.mockRestore()
    })

    it('falls back to mock embedding on 429 rate limit (does not throw)', async () => {
        setVoyageMockBehavior('rate_limit')
        vi.resetModules()
        const { logCompat: freshLogCompat } = await import('@/lib/logger')
        const warn = vi.spyOn(freshLogCompat, 'warn').mockImplementation(() => {})
        const { generateEmbedding } = await import('../embeddings')
        const v = await generateEmbedding('x')
        expect(v).toHaveLength(1024)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Voyage AI error'))
        warn.mockRestore()
    })

    it('falls back to mock embedding on network error', async () => {
        setVoyageMockBehavior('network_error')
        vi.resetModules()
        const { logCompat: freshLogCompat } = await import('@/lib/logger')
        const warn = vi.spyOn(freshLogCompat, 'warn').mockImplementation(() => {})
        const { generateEmbedding } = await import('../embeddings')
        const v = await generateEmbedding('x')
        expect(v).toHaveLength(1024)
        warn.mockRestore()
    })
})

describe('deterministicEmbedding (mock helper itself)', () => {
    it('is a stable hash → vector function', () => {
        expect(deterministicEmbedding('a')).toEqual(deterministicEmbedding('a'))
        expect(deterministicEmbedding('a')).not.toEqual(deterministicEmbedding('b'))
    })

    it('always returns 1024 dims', () => {
        expect(deterministicEmbedding('any-input')).toHaveLength(1024)
    })

    it('produces values in a small bounded range (≤ 0.1)', () => {
        const v = deterministicEmbedding('test')
        expect(v.every(n => Math.abs(n) <= 0.1)).toBe(true)
    })
})
