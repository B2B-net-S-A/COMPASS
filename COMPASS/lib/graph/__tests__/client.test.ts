import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Podmieniamy SDK w całości — testujemy naszą obudowę (deadline + ustawienia
// ponowień), nie transport Microsoftu.

const requestLog: {
    path: string
    fetchOptions: Record<string, unknown>[]
    middlewareOptions: unknown[][]
} = { path: '', fetchOptions: [], middlewareOptions: [] }

let getBehaviour: () => Promise<unknown> = () => Promise.resolve({ ok: true })

function makeRequest(path: string) {
    requestLog.path = path
    const request = {
        options(opts: Record<string, unknown>) {
            requestLog.fetchOptions.push(opts)
            return request
        },
        middlewareOptions(opts: unknown[]) {
            requestLog.middlewareOptions.push(opts)
            return request
        },
        select() {
            return request
        },
        responseType() {
            return request
        },
        get: () => getBehaviour(),
        post: () => getBehaviour(),
        patch: () => getBehaviour(),
        delete: () => getBehaviour(),
    }
    return request
}

class FakeRetryHandlerOptions {
    constructor(
        public delay?: number,
        public maxRetries?: number,
    ) {}
}

vi.mock('isomorphic-fetch', () => ({ default: {} }))
vi.mock('@azure/identity', () => ({
    ClientSecretCredential: class {
        getToken() {
            return Promise.resolve({ token: 'test-token' })
        }
    },
}))
vi.mock('@microsoft/microsoft-graph-client', () => ({
    Client: { init: () => ({ api: (path: string) => makeRequest(path) }) },
    RetryHandlerOptions: FakeRetryHandlerOptions,
}))

async function loadClient() {
    vi.resetModules()
    return import('@/lib/graph/client')
}

describe('graph client', () => {
    beforeEach(() => {
        process.env.AZURE_TENANT_ID = 'tenant'
        process.env.AZURE_CLIENT_ID = 'client'
        process.env.AZURE_CLIENT_SECRET = 'secret'
        delete process.env.GRAPH_REQUEST_TIMEOUT_MS
        requestLog.path = ''
        requestLog.fetchOptions = []
        requestLog.middlewareOptions = []
        getBehaviour = () => Promise.resolve({ ok: true })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('graphRequestTimeoutMs', () => {
        it('domyślnie 20 s', async () => {
            const { graphRequestTimeoutMs } = await loadClient()
            expect(graphRequestTimeoutMs()).toBe(20_000)
        })

        it('honoruje GRAPH_REQUEST_TIMEOUT_MS w rozsądnym zakresie', async () => {
            process.env.GRAPH_REQUEST_TIMEOUT_MS = '5000'
            const { graphRequestTimeoutMs } = await loadClient()
            expect(graphRequestTimeoutMs()).toBe(5_000)
        })

        it('ignoruje wartości absurdalne — inaczej literówka w env cicho zdejmuje limit', async () => {
            const { graphRequestTimeoutMs } = await loadClient()
            for (const bad of ['0', '-1', '999999999', 'dużo', '']) {
                process.env.GRAPH_REQUEST_TIMEOUT_MS = bad
                expect(graphRequestTimeoutMs()).toBe(20_000)
            }
        })
    })

    it('zrywa zawieszone żądanie po upływie budżetu', async () => {
        vi.useFakeTimers()
        process.env.GRAPH_REQUEST_TIMEOUT_MS = '1000'
        const { getGraphClient, GraphTimeoutError } = await loadClient()

        getBehaviour = () => new Promise(() => {}) // skrzynka, która nigdy nie odpowiada
        const client = await getGraphClient()
        const pending = client.api('/users/hang@example.com/mailboxSettings').get()
        const assertion = expect(pending).rejects.toBeInstanceOf(GraphTimeoutError)

        await vi.advanceTimersByTimeAsync(1_000)
        await assertion

        const signal = requestLog.fetchOptions.at(-1)?.signal as AbortSignal
        expect(signal.aborted).toBe(true)
    })

    it('nie rusza żądań, które zdążyły odpowiedzieć', async () => {
        const { getGraphClient } = await loadClient()
        getBehaviour = () => Promise.resolve({ value: 'ok' })

        const client = await getGraphClient()
        await expect(client.api('/users/ok@example.com/messageRules').get()).resolves.toEqual({
            value: 'ok',
        })
    })

    it('każde żądanie dostaje własny signal i jawne ustawienia ponowień', async () => {
        const { getGraphClient } = await loadClient()
        const client = await getGraphClient()

        await client.api('/a').get()
        await client.api('/b').post({})

        expect(requestLog.fetchOptions).toHaveLength(2)
        const [first, second] = requestLog.fetchOptions
        expect(first.signal).toBeInstanceOf(AbortSignal)
        expect(first.signal).not.toBe(second.signal)

        for (const opts of requestLog.middlewareOptions) {
            const retry = opts[0] as FakeRetryHandlerOptions
            expect(retry).toBeInstanceOf(FakeRetryHandlerOptions)
            // Domyślne 3 podejścia SDK mnożyłyby się z pętlami retry wywołujących.
            expect(retry.maxRetries).toBe(2)
            expect(retry.delay).toBe(1)
        }
    })

    // Audyt 2026-08: `headers` na błędzie z SDK to surowy obiekt `Headers` z fetcha
    // (GraphErrorHandler przypisuje `rawResponse.headers`), a nie zwykły rekord —
    // odczyt indeksem zwracał zawsze undefined i `Retry-After` z throttlingu 429
    // nigdy nie docierał do pętli ponowień.
    describe('extractGraphErrorInfo', () => {
        it('czyta Retry-After z obiektu Headers (kształt realnego SDK)', async () => {
            const { extractGraphErrorInfo } = await loadClient()
            const err = { statusCode: 429, headers: new Headers({ 'Retry-After': '180' }) }
            expect(extractGraphErrorInfo(err)).toEqual({ statusCode: 429, retryAfterMs: 180_000 })
        })

        it('czyta Retry-After ze zwykłego rekordu, niezależnie od wielkości liter', async () => {
            const { extractGraphErrorInfo } = await loadClient()
            expect(extractGraphErrorInfo({ statusCode: 503, headers: { 'Retry-After': '30' } }))
                .toEqual({ statusCode: 503, retryAfterMs: 30_000 })
            expect(extractGraphErrorInfo({ statusCode: 429, headers: { 'retry-after': '5' } }))
                .toEqual({ statusCode: 429, retryAfterMs: 5_000 })
        })

        it('pomija wartości bezużyteczne zamiast rzucać', async () => {
            const { extractGraphErrorInfo } = await loadClient()
            expect(extractGraphErrorInfo({ statusCode: 429 })).toEqual({ statusCode: 429 })
            expect(extractGraphErrorInfo({ statusCode: 429, headers: new Headers() })).toEqual({ statusCode: 429 })
            expect(extractGraphErrorInfo({ statusCode: 429, headers: { 'retry-after': '0' } })).toEqual({ statusCode: 429 })
            expect(extractGraphErrorInfo({ statusCode: 429, headers: { 'retry-after': 'nigdy' } })).toEqual({ statusCode: 429 })
            expect(extractGraphErrorInfo(null)).toEqual({})
            expect(extractGraphErrorInfo('boom')).toEqual({})
        })
    })

    it('deadline obejmuje też łańcuch select()/responseType()', async () => {
        vi.useFakeTimers()
        process.env.GRAPH_REQUEST_TIMEOUT_MS = '1000'
        const { getGraphClient, GraphTimeoutError } = await loadClient()
        getBehaviour = () => new Promise(() => {})

        const client = await getGraphClient()
        const pending = client.api('/users/x/photo/$value').responseType('arraybuffer').get()
        const assertion = expect(pending).rejects.toBeInstanceOf(GraphTimeoutError)
        await vi.advanceTimersByTimeAsync(1_000)
        await assertion
    })
})
