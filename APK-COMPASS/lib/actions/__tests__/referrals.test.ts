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

describe('submitProjectReferral', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { submitProjectReferral } = await import('../referrals')
        await expect(submitProjectReferral({ project_id: 'p1' } as any)).rejects.toThrow('Unauthorized')
    })

    it('inserts a referral with referrer_user_id and status="new"', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { project_referrals: [] },
        })
        const { submitProjectReferral } = await import('../referrals')
        const result = await submitProjectReferral({ project_id: 'p1', referee_full_name: 'Jane' } as any)
        expect(result.success).toBe(true)
        const row = currentClient._tables.project_referrals[0]
        expect(row.referrer_user_id).toBe('u1')
        expect(row.status).toBe('new')
    })
})

describe('getAdminReferrals — RBAC', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { getAdminReferrals } = await import('../referrals')
        await expect(getAdminReferrals()).rejects.toThrow('Unauthorized')
    })

    it('throws Forbidden for consultant role', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getAdminReferrals } = await import('../referrals')
        await expect(getAdminReferrals()).rejects.toThrow('Forbidden')
    })

    it.each(['admin', 'administrator', 'centrala', 'consultant_manager'])('allows %s role', async (role) => {
        setup({
            user: { id: 'u1', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u1', role }],
                project_referrals: [],
            },
        })
        const { getAdminReferrals } = await import('../referrals')
        await expect(getAdminReferrals()).resolves.toEqual([])
    })
})

describe('updateReferralStatus', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { updateReferralStatus } = await import('../referrals')
        await expect(updateReferralStatus('r1', 'approved')).rejects.toThrow('Unauthorized')
    })

    it('updates status + rejection_reason on a referral', async () => {
        setup({
            user: { id: 'u1', email: 'a@x.com' },
            tables: {
                project_referrals: [{ id: 'r1', status: 'new', rejection_reason: null }],
            },
        })
        const { updateReferralStatus } = await import('../referrals')
        await updateReferralStatus('r1', 'rejected', 'duplicate')
        const row = currentClient._tables.project_referrals[0]
        expect(row.status).toBe('rejected')
        expect(row.rejection_reason).toBe('duplicate')
    })
})

describe('getMyReferrals', () => {
    it('returns [] when not authenticated', async () => {
        setup({ user: null })
        const { getMyReferrals } = await import('../referrals')
        expect(await getMyReferrals()).toEqual([])
    })

    it('returns only referrals where referrer_user_id matches current user', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                project_referrals: [
                    { id: 'r1', referrer_user_id: 'u1', status: 'new', created_at: '2026-04-01' },
                    { id: 'r2', referrer_user_id: 'u2', status: 'new', created_at: '2026-04-02' },
                    { id: 'r3', referrer_user_id: 'u1', status: 'rejected', created_at: '2026-04-15' },
                ],
            },
        })
        const { getMyReferrals } = await import('../referrals')
        const result = await getMyReferrals()
        expect(result.map(r => r.id).sort()).toEqual(['r1', 'r3'])
    })
})

describe('withdrawReferral', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { withdrawReferral } = await import('../referrals')
        await expect(withdrawReferral('r1')).rejects.toThrow('Unauthorized')
    })

    it('updates status to "withdrawn" — only for own referrals in status [new, in_review]', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                project_referrals: [
                    { id: 'r1', referrer_user_id: 'u1', status: 'new' },
                    { id: 'r2', referrer_user_id: 'u1', status: 'approved' },     // not eligible — different status
                    { id: 'r3', referrer_user_id: 'u-other', status: 'new' },     // not eligible — different user
                ],
            },
        })
        const { withdrawReferral } = await import('../referrals')
        await withdrawReferral('r1')
        const row1 = currentClient._tables.project_referrals.find((r: any) => r.id === 'r1')
        const row2 = currentClient._tables.project_referrals.find((r: any) => r.id === 'r2')
        const row3 = currentClient._tables.project_referrals.find((r: any) => r.id === 'r3')
        expect(row1?.status).toBe('withdrawn')
        expect(row2?.status).toBe('approved')   // unchanged
        expect(row3?.status).toBe('new')        // unchanged (RLS-like)
    })
})
