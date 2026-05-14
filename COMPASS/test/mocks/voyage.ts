import { vi } from 'vitest'

const EMBEDDING_DIM = 1024

function hashString(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

export function deterministicEmbedding(text: string): number[] {
    const seed = hashString(text)
    const out = new Array<number>(EMBEDDING_DIM)
    let state = seed || 1
    for (let i = 0; i < EMBEDDING_DIM; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        out[i] = ((state / 0x7fffffff) - 0.5) * 0.2
    }
    return out
}

let mockBehavior: 'success' | 'rate_limit' | 'auth_error' | 'network_error' = 'success'

export function setVoyageMockBehavior(b: typeof mockBehavior): void {
    mockBehavior = b
}

export function resetVoyageMock(): void {
    mockBehavior = 'success'
}

export function installVoyageFetchMock(): void {
    const realFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as Request).url
        if (url.includes('voyageai.com')) {
            if (mockBehavior === 'rate_limit') {
                return new Response('rate limited', { status: 429 })
            }
            if (mockBehavior === 'auth_error') {
                return new Response('unauthorized', { status: 401 })
            }
            if (mockBehavior === 'network_error') {
                throw new Error('network error')
            }
            const body = init?.body ? JSON.parse(init.body as string) : {}
            const text = Array.isArray(body.input) ? body.input[0] : ''
            const embedding = deterministicEmbedding(text)
            return new Response(JSON.stringify({
                object: 'list',
                data: [{ index: 0, embedding }],
                model: body.model || 'voyage-3-large',
                usage: { total_tokens: text.length },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return realFetch(input as RequestInfo, init)
    }) as unknown as typeof fetch
}
