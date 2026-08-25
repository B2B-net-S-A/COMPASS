import { describe, expect, it, vi } from 'vitest'
import { hardenedFetch } from '../fetch-hardening'

// Incydent 2026-08-25: zrywane transfery dużych odpowiedzi PostgREST + zatruty
// Data Cache Next.js. hardenedFetch = no-store + retry sieciowych GET-ów.

const okResponse = () => new Response('[]', { status: 200 })

describe('hardenedFetch', () => {
    it('wymusza cache: no-store na każdym żądaniu', async () => {
        const impl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => okResponse())
        await hardenedFetch('https://example.test/rest/v1/x', { method: 'GET' }, impl)
        expect(impl).toHaveBeenCalledTimes(1)
        expect(impl.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
    })

    it('ponawia GET po sieciowym odrzuceniu i zwraca udaną odpowiedź', async () => {
        const impl = vi.fn()
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(okResponse())
        const res = await hardenedFetch('https://example.test/rest/v1/x', undefined, impl as unknown as typeof fetch)
        expect(res.status).toBe(200)
        expect(impl).toHaveBeenCalledTimes(3)
    })

    it('poddaje się po wyczerpaniu prób i rzuca ostatni błąd', async () => {
        const impl = vi.fn(async () => { throw new TypeError('fetch failed') })
        await expect(
            hardenedFetch('https://example.test/rest/v1/x', { method: 'GET' }, impl),
        ).rejects.toThrow('fetch failed')
        expect(impl).toHaveBeenCalledTimes(3)
    })

    it('NIE ponawia mutacji (POST) — podwójny insert gorszy niż widoczny błąd', async () => {
        const impl = vi.fn(async () => { throw new TypeError('fetch failed') })
        await expect(
            hardenedFetch('https://example.test/rest/v1/x', { method: 'POST' }, impl),
        ).rejects.toThrow('fetch failed')
        expect(impl).toHaveBeenCalledTimes(1)
    })

    it('NIE ponawia odpowiedzi HTTP z błędem (4xx/5xx wracają do postgrest-js)', async () => {
        const impl = vi.fn(async () => new Response('err', { status: 500 }))
        const res = await hardenedFetch('https://example.test/rest/v1/x', { method: 'GET' }, impl)
        expect(res.status).toBe(500)
        expect(impl).toHaveBeenCalledTimes(1)
    })

    it('metodę czyta z obiektu Request, gdy init jej nie niesie', async () => {
        const impl = vi.fn(async () => { throw new TypeError('fetch failed') })
        const req = new Request('https://example.test/rest/v1/x', { method: 'POST' })
        await expect(hardenedFetch(req, undefined, impl)).rejects.toThrow('fetch failed')
        expect(impl).toHaveBeenCalledTimes(1)
    })
})
