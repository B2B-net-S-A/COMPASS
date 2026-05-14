import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

function setupClient(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('addLoyaltyPoints', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { addLoyaltyPoints } = await import('../loyalty')
        const result = await addLoyaltyPoints('u-target', 100, 'manual_bonus', 'Bonus')
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects when caller is a regular consultant (no admin/centrala role)', async () => {
        setupClient({
            user: { id: 'u-consultant', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u-consultant', role: 'consultant' }] },
        })
        const { addLoyaltyPoints } = await import('../loyalty')
        const result = await addLoyaltyPoints('u-target', 100, 'manual_bonus', 'Bonus')
        expect(result).toEqual({ success: false, error: 'Niewystarczające uprawnienia' })
    })

    it.each(['admin'])('allows %s role to add points', async (role) => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role }],
                loyalty_transactions: [],
            },
        })
        const { addLoyaltyPoints } = await import('../loyalty')
        const result = await addLoyaltyPoints('u-target', 250, 'manual_bonus', 'Test bonus')
        expect(result.success).toBe(true)
        const tx = currentClient._tables.loyalty_transactions[0]
        expect(tx.user_id).toBe('u-target')
        expect(tx.points).toBe(250)
        expect(tx.source_type).toBe('manual_bonus')
        expect(tx.description).toBe('Test bonus')
    })

    it('supports negative points (penalty)', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                loyalty_transactions: [],
            },
        })
        const { addLoyaltyPoints } = await import('../loyalty')
        const result = await addLoyaltyPoints('u-target', -50, 'penalty', 'Mistake')
        expect(result.success).toBe(true)
        expect(currentClient._tables.loyalty_transactions[0].points).toBe(-50)
    })
})

describe('searchUsers', () => {
    it('returns [] when not authenticated', async () => {
        setupClient({ user: null })
        const { searchUsers } = await import('../loyalty')
        expect(await searchUsers('Jan')).toEqual([])
    })

    it('returns [] for queries shorter than 2 chars', async () => {
        setupClient({ user: { id: 'u1', email: 'x@x.com' } })
        const { searchUsers } = await import('../loyalty')
        expect(await searchUsers('a')).toEqual([])
        expect(await searchUsers('')).toEqual([])
    })
})

describe('getLoyaltyRules', () => {
    it('returns DB rules when table is populated', async () => {
        setupClient({
            tables: {
                loyalty_rules: [
                    { id: 'r1', code: 'referral_hired', name: 'Referral', points: 1000, category: 'Recruitment', description: null, is_active: true },
                    { id: 'r2', code: 'role_ambassador', name: 'Ambasador', points: 200, category: 'Compass', description: null, is_active: true },
                ],
            },
        })
        const { getLoyaltyRules } = await import('../loyalty')
        const rules = await getLoyaltyRules()
        expect(rules).toHaveLength(2)
        expect(rules[0].code).toBe('referral_hired')
    })

    it('returns empty array when DB table exists but has no rows (no fallback)', async () => {
        setupClient({ tables: { loyalty_rules: [] } })
        const { getLoyaltyRules } = await import('../loyalty')
        const rules = await getLoyaltyRules()
        expect(rules).toEqual([])
    })
})

describe('updateLoyaltyRule', () => {
    it('returns warning for mock IDs (table missing)', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: { profiles: [{ id: 'u-admin', role: 'admin' }] },
        })
        const { updateLoyaltyRule } = await import('../loyalty')
        const result = await updateLoyaltyRule('mock-0', { points: 500 })
        expect(result.success).toBe(false)
        expect((result as { warning?: string }).warning).toMatch(/Database table.*missing/)
    })

    it('rejects non-admins', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { updateLoyaltyRule } = await import('../loyalty')
        const result = await updateLoyaltyRule('r1', { points: 500 })
        expect(result.success).toBe(false)
        expect((result as { error: string }).error).toMatch(/uprawnienia/)
    })

    it('updates the rule for an admin', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                loyalty_rules: [{ id: 'r1', code: 'referral_hired', name: 'Referral', points: 1000, category: 'Recruitment', is_active: true, description: null }],
            },
        })
        const { updateLoyaltyRule } = await import('../loyalty')
        const result = await updateLoyaltyRule('r1', { points: 1500 })
        expect(result.success).toBe(true)
        expect(currentClient._tables.loyalty_rules[0].points).toBe(1500)
    })
})

describe('getLoyaltyHistory', () => {
    it('returns 401-like error when not authenticated', async () => {
        setupClient({ user: null })
        const { getLoyaltyHistory } = await import('../loyalty')
        const result = await getLoyaltyHistory()
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('returns user transaction history sorted desc', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                loyalty_transactions: [
                    { id: 't1', user_id: 'u1', points: 100, source_type: 'manual', description: '1', created_at: '2026-01-01T00:00:00Z' },
                    { id: 't2', user_id: 'u1', points: 200, source_type: 'manual', description: '2', created_at: '2026-04-01T00:00:00Z' },
                    { id: 't3', user_id: 'u1', points: 300, source_type: 'manual', description: '3', created_at: '2026-02-01T00:00:00Z' },
                ],
            },
        })
        const { getLoyaltyHistory } = await import('../loyalty')
        const result = await getLoyaltyHistory(2)
        expect(result.success).toBe(true)
        expect((result as { history: Array<{ id: string }> }).history).toHaveLength(2)
        expect((result as { history: Array<{ id: string }> }).history[0].id).toBe('t2')
    })

    it('only returns the current user transactions (RLS-like filter)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                loyalty_transactions: [
                    { id: 't1', user_id: 'u1', points: 100, source_type: 'm', description: 'mine', created_at: '2026-01-01' },
                    { id: 't2', user_id: 'u2', points: 200, source_type: 'm', description: 'theirs', created_at: '2026-01-02' },
                ],
            },
        })
        const { getLoyaltyHistory } = await import('../loyalty')
        const result = await getLoyaltyHistory(10) as { success: true; history: Array<{ user_id: string }> }
        expect(result.history.every(t => t.user_id === 'u1')).toBe(true)
    })
})

describe('getTierProgress', () => {
    it('returns 401 when not authenticated', async () => {
        setupClient({ user: null })
        const { getTierProgress } = await import('../loyalty')
        expect((await getTierProgress()).success).toBe(false)
    })

    it('returns 100% progress for the top tier (no next tier)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', loyalty_points: 30000, loyalty_tier: 'legend' }] },
        })
        const { getTierProgress } = await import('../loyalty')
        const result = await getTierProgress() as { success: true; progressPercent: number; pointsToNextTier: number }
        expect(result.progressPercent).toBe(100)
        expect(result.pointsToNextTier).toBe(0)
    })

    it('computes points-to-next correctly within scout tier', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', loyalty_points: 100, loyalty_tier: 'scout' }] },
        })
        const { getTierProgress } = await import('../loyalty')
        const result = await getTierProgress() as { success: true; pointsToNextTier: number; nextTier: string }
        expect(result.pointsToNextTier).toBeGreaterThan(0)
        expect(['explorer', 'pathfinder', 'navigator', 'captain', 'admiral', 'legend']).toContain(result.nextTier)
    })
})

describe('getAllConsultantsLoyalty (admin only)', () => {
    it('rejects non-admin users', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getAllConsultantsLoyalty } = await import('../loyalty')
        const result = await getAllConsultantsLoyalty()
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/uprawnienia/)
    })

    it('computes tier distribution and avg points', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role: 'admin' },
                    { id: 'c1', role: 'consultant', full_name: 'A', email: 'a@x.com', loyalty_points: 1000, loyalty_tier: 'pathfinder', loyalty_joined_at: '2026' },
                    { id: 'c2', role: 'consultant', full_name: 'B', email: 'b@x.com', loyalty_points: 100, loyalty_tier: 'scout', loyalty_joined_at: '2026' },
                    { id: 'c3', role: 'consultant', full_name: 'C', email: 'c@x.com', loyalty_points: 4000, loyalty_tier: 'navigator', loyalty_joined_at: '2026' },
                ],
            },
        })
        const { getAllConsultantsLoyalty } = await import('../loyalty')
        const result = await getAllConsultantsLoyalty() as { success: true; consultants: Array<{ id: string }>; stats: { totalConsultants: number; avgPoints: number; tierDistribution: Record<string, number>; topPerformer: { id: string } | null } }
        expect(result.consultants).toHaveLength(3)
        expect(result.stats.totalConsultants).toBe(3)
        expect(result.stats.avgPoints).toBe(Math.round((1000 + 100 + 4000) / 3))
        expect(result.stats.tierDistribution).toEqual({
            scout: 1, explorer: 0, pathfinder: 1, navigator: 1, captain: 0, admiral: 0, legend: 0,
        })
        expect(result.stats.topPerformer?.id).toBe('c3')
    })
})
