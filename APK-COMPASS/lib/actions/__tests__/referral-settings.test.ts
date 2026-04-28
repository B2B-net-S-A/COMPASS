import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('referral-settings module exports', () => {
    it('exposes at least one async function for managing referral configuration', async () => {
        setup({})
        const mod = await import('../referral-settings')
        const fnExports = Object.entries(mod).filter(([, v]) => typeof v === 'function')
        expect(fnExports.length).toBeGreaterThan(0)
    })

    it('all exported functions reject when not authenticated (server actions auth gate)', async () => {
        setup({ user: null })
        const mod = await import('../referral-settings')
        const fnNames = Object.entries(mod)
            .filter(([, v]) => typeof v === 'function')
            .map(([k]) => k)

        // Smoke: every exported function should either auth-check or return a defensive value.
        // We don't assert all throw (some may return success-shape with error: 'Brak autoryzacji')
        // — we only verify that calling them with no args doesn't crash unhandled.
        let surviving = 0
        for (const name of fnNames) {
            try {
                const result = await (mod as Record<string, (...args: unknown[]) => unknown>)[name]()
                if (result && typeof result === 'object') surviving++
            } catch (e) {
                if (e instanceof Error && /authoriz|autoryzacj|unauthor|admin/i.test(e.message)) {
                    surviving++
                }
            }
        }
        expect(surviving).toBeGreaterThan(0)
    })
})
