import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase } from '@/test/mocks/supabase'

let client: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => client,
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => client,
}))

beforeEach(() => {
    client = createMockSupabaseClient({
        user: { id: 'u1', email: 'user@b2bnetwork.pl' },
        tables: {
            profiles: [
                { id: 'u1', onboarding_tour_done: false },
                { id: 'u2', onboarding_tour_done: false },
            ],
        },
    })
})

describe('setOnboardingTourDone', () => {
    it('authenticates with the session and updates only the current profile via service client', async () => {
        const { setOnboardingTourDone } = await import('../onboarding')

        expect(await setOnboardingTourDone()).toEqual({ success: true })
        expect(client._tables.profiles).toEqual([
            { id: 'u1', onboarding_tour_done: true },
            { id: 'u2', onboarding_tour_done: false },
        ])
    })
})
