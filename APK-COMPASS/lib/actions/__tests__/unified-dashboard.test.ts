import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

// Mock dependent modules to keep this test focused on the unified-dashboard wiring
vi.mock('@/lib/actions/dashboard', () => ({
    getDashboardStats: vi.fn(async () => ({ success: true, stats: { profile: { id: 'u1' } } })),
    getContractStatus: vi.fn(async () => ({ success: true, hasContract: false, daysRemaining: null })),
    getQuickActions: vi.fn(async () => ({ success: true, actions: [] })),
}))

vi.mock('@/lib/actions/centrala', () => ({
    getCentralaStats: vi.fn(async () => ({ activeConsultants: 0, openProjects: 0 })),
    getConsultantsList: vi.fn(async () => []),
}))

vi.mock('@/lib/actions/notifications', () => ({
    getRecentNotifications: vi.fn(async () => ({ success: true, notifications: [] })),
}))

vi.mock('@/lib/actions/centrala-management', () => ({
    getMyRecruiter: vi.fn(async () => null),
}))

vi.mock('@/lib/actions/admin-dashboard', () => ({
    getAdminDashboardData: vi.fn(async () => ({ candidates: [], projects: [], stats: {} })),
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

beforeEach(() => {
    process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('getUnifiedDashboardData', () => {
    it('returns auth error when not signed in', async () => {
        setup({ user: null })
        const { getUnifiedDashboardData } = await import('../unified-dashboard')
        const result = await getUnifiedDashboardData()
        expect(result.success).toBe(false)
        expect((result as { error: string }).error).toMatch(/zalogowany/)
    })

    it('promotes super_admin email to administrator role regardless of profile.role', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({
            user: { id: 'u-super', email: 'super@b2bnetwork.pl' },
            tables: { profiles: [{ id: 'u-super', role: 'consultant' }] },
        })
        const { getUnifiedDashboardData } = await import('../unified-dashboard')
        const result = await getUnifiedDashboardData() as { success: true; role: string }
        expect(result.role).toBe('administrator')
    })

    it('returns role from profile when not super admin', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({
            user: { id: 'u1', email: 'consultant@b2bnetwork.pl' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getUnifiedDashboardData } = await import('../unified-dashboard')
        const result = await getUnifiedDashboardData() as { success: true; role: string }
        expect(result.role).toBe('consultant')
    })

    it('overrides role with explicit roleHint when provided', async () => {
        setup({
            user: { id: 'u1', email: 'admin@b2bnetwork.pl' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getUnifiedDashboardData } = await import('../unified-dashboard')
        const result = await getUnifiedDashboardData('admin') as { success: true; role: string }
        expect(result.role).toBe('admin')
    })
})
