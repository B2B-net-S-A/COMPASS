import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
}))

import { createServiceClient, probeServiceDatabase } from '../admin'

function probeClient(error: { message: string } | null = null) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    builder.select = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.abortSignal = vi.fn(async () => ({ data: [], error }))
    return { from: vi.fn(() => builder) }
}

describe('server-only Supabase service boundary', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        delete process.env.SUPABASE_SECRET_KEY
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it('creates a non-persistent client from the legacy key fallback', () => {
        const client = { marker: 'legacy' }
        createClientMock.mockReturnValue(client)
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://legacy-test.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy-test-key')

        expect(createServiceClient()).toBe(client)
        expect(createClientMock).toHaveBeenCalledWith(
            'https://legacy-test.supabase.co',
            'legacy-test-key',
            expect.objectContaining({
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false,
                },
            }),
        )
    })

    it('prefers a dedicated secret key over the legacy fallback', () => {
        createClientMock.mockReturnValue({ marker: 'secret' })
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://secret-test.supabase.co')
        vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-key')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy-must-not-win')

        createServiceClient()

        expect(createClientMock.mock.calls.at(-1)?.[1]).toBe('test-secret-key')
    })

    it('fails closed after a configured credential is removed, even with a cached client', () => {
        createClientMock.mockReturnValue({ marker: 'cached' })
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://cache-test.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'cache-test-key')
        createServiceClient()

        delete process.env.SUPABASE_SERVICE_ROLE_KEY

        expect(() => createServiceClient()).toThrow('Prywatny klucz Supabase')
    })

    it('rejects a non-local plaintext service URL', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://remote.example.com')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unsafe-url-key')

        expect(() => createServiceClient()).toThrow('bezpiecznym adresem HTTPS')
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('returns only probe status and applies a non-caching fetch wrapper', async () => {
        createClientMock.mockReturnValue(probeClient())
        const fetchImpl = vi.fn()
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://probe-test.supabase.co')
        vi.stubEnv('SUPABASE_SECRET_KEY', 'test-probe-secret-key')
        vi.stubGlobal('fetch', fetchImpl)

        await expect(probeServiceDatabase()).resolves.toBe(true)
        const options = createClientMock.mock.calls.at(-1)?.[2]
        await options.global.fetch('https://probe-test.supabase.co/rest/v1/profiles')

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://probe-test.supabase.co/rest/v1/profiles',
            expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
        )
    })

    it('fails the database probe closed on a PostgREST error', async () => {
        createClientMock.mockReturnValue(probeClient({ message: 'denied' }))
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://probe-error.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'probe-error-key')
        vi.stubGlobal('fetch', vi.fn())

        await expect(probeServiceDatabase()).resolves.toBe(false)
    })
})
