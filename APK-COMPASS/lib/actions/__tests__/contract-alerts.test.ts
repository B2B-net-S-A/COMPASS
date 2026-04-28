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

describe('contract-alerts module exports', () => {
    it('exports at least one named function', async () => {
        setup({})
        const mod = await import('../contract-alerts')
        const fnExports = Object.values(mod).filter((v) => typeof v === 'function')
        expect(fnExports.length).toBeGreaterThan(0)
    })
})
