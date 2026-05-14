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

describe('getDashboardStats', () => {
    it('returns auth error when not signed in', async () => {
        setup({ user: null })
        const { getDashboardStats } = await import('../dashboard')
        const result = await getDashboardStats()
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/zalogowany/)
    })

    it('returns profile + zeros when authenticated (no contracts/notifications/referrals)', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', full_name: 'Test', role: 'consultant', avatar_url: null, loyalty_points: 0, loyalty_tier: 'bronze' }],
                contracts: [],
                favorite_projects: [],
                notifications: [],
                project_referrals: [],
            },
        })
        const { getDashboardStats } = await import('../dashboard')
        const result = await getDashboardStats() as { success: true; stats: { profile: { id: string }; loyaltyTier: string; loyaltyPoints: number } }
        expect(result.success).toBe(true)
        expect(result.stats.profile.id).toBe('u1')
        expect(result.stats.loyaltyTier).toBe('bronze')
    })

    it('falls back to email-derived name when profile is missing', async () => {
        setup({
            user: { id: 'u-no-profile', email: 'fallback.user@x.com' },
            tables: {
                profiles: [],
                contracts: [],
                favorite_projects: [],
                notifications: [],
                project_referrals: [],
            },
        })
        const { getDashboardStats } = await import('../dashboard')
        const result = await getDashboardStats() as { success: true; stats: { profile: { full_name: string; loyalty_tier: string } } }
        expect(result.stats.profile.full_name).toBe('fallback.user')
        expect(result.stats.profile.loyalty_tier).toBe('bronze')
    })
})

describe('getContractStatus', () => {
    it('returns auth error when not signed in', async () => {
        setup({ user: null })
        const { getContractStatus } = await import('../dashboard')
        const result = await getContractStatus()
        expect(result.success).toBe(false)
    })

    it('returns hasContract=false when no active contract', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { contracts: [] },
        })
        const { getContractStatus } = await import('../dashboard')
        const result = await getContractStatus() as { success: true; hasContract: boolean; daysRemaining: number | null }
        expect(result.success).toBe(true)
        expect(result.hasContract).toBe(false)
        expect(result.daysRemaining).toBeNull()
    })

    it('computes daysRemaining for an active contract with end_date in the future', async () => {
        const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                contracts: [
                    { id: 'c1', consultant_id: 'u1', status: 'active', end_date: futureEnd },
                ],
            },
        })
        const { getContractStatus } = await import('../dashboard')
        const result = await getContractStatus() as { success: true; hasContract: boolean; daysRemaining: number }
        expect(result.hasContract).toBe(true)
        expect(result.daysRemaining).toBeGreaterThanOrEqual(29)
        expect(result.daysRemaining).toBeLessThanOrEqual(30)
    })
})

describe('getQuickActions', () => {
    it('returns auth error when not signed in', async () => {
        setup({ user: null })
        const { getQuickActions } = await import('../dashboard')
        const result = await getQuickActions()
        expect(result.success).toBe(false)
    })

    it('returns 4 actions sorted by priority (high first)', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', cv_url: '/cv.pdf', full_name: 'A' }],
                contracts: [],
            },
        })
        const { getQuickActions } = await import('../dashboard')
        const result = await getQuickActions() as { success: true; actions: Array<{ id: string; priority: string }> }
        expect(result.actions).toHaveLength(4)
        // First action should have priority 'high'
        expect(result.actions[0].priority).toBe('high')
    })

    it('flags "browse_projects" as HIGH priority when consultant has no active contract', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', cv_url: '/cv.pdf', full_name: 'A' }], contracts: [] },
        })
        const { getQuickActions } = await import('../dashboard')
        const result = await getQuickActions() as { success: true; actions: Array<{ id: string; priority: string }> }
        const browse = result.actions.find(a => a.id === 'browse_projects')
        expect(browse?.priority).toBe('high')
    })

    it('flags "update_profile" as HIGH priority when CV missing', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', cv_url: null, full_name: 'A' }], contracts: [] },
        })
        const { getQuickActions } = await import('../dashboard')
        const result = await getQuickActions() as { success: true; actions: Array<{ id: string; priority: string; description_pl: string }> }
        const updateProfile = result.actions.find(a => a.id === 'update_profile')
        expect(updateProfile?.priority).toBe('high')
        expect(updateProfile?.description_pl).toMatch(/Dodaj CV/i)
    })
})
