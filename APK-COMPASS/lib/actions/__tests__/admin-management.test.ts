import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
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
    vi.resetModules()
})

describe('admin-management — RBAC gate (requireSuperAdmin)', () => {
    it('throws Unauthorized when not signed in', async () => {
        setup({ user: null })
        vi.resetModules()
        const { getAdminMembers } = await import('../admin-management')
        await expect(getAdminMembers()).rejects.toThrow('Unauthorized')
    })

    it('throws when caller is not in SUPER_ADMIN_EMAILS', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({ user: { id: 'u1', email: 'normal@b2bnetwork.pl' } })
        vi.resetModules()
        const { getAdminMembers } = await import('../admin-management')
        await expect(getAdminMembers()).rejects.toThrow(/Super Admina/)
    })

    it('allows super admin (email match in env)', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({
            user: { id: 'u-super', email: 'super@b2bnetwork.pl' },
            tables: { admin_access_list: [], profiles: [] },
        })
        vi.resetModules()
        const { getAdminMembers } = await import('../admin-management')
        const result = await getAdminMembers()
        expect(result).toEqual([])
    })
})

describe('addAdminMember', () => {
    it('rejects non-@b2bnetwork.pl emails', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({ user: { id: 'u-super', email: 'super@b2bnetwork.pl' } })
        vi.resetModules()
        const { addAdminMember } = await import('../admin-management')
        await expect(addAdminMember('outsider@gmail.com')).rejects.toThrow(/@b2bnetwork\.pl/)
    })

    it('rejects super admins (already privileged)', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl,other@b2bnetwork.pl'
        setup({ user: { id: 'u-super', email: 'super@b2bnetwork.pl' } })
        vi.resetModules()
        const { addAdminMember } = await import('../admin-management')
        await expect(addAdminMember('other@b2bnetwork.pl')).rejects.toThrow(/Super Admin nie wymaga/)
    })

    it('inserts a row into admin_access_list with lowercase email + added_by', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({
            user: { id: 'u-super', email: 'super@b2bnetwork.pl' },
            tables: {
                admin_access_list: [],
                centrala_access_list: [],
                profiles: [],
            },
        })
        vi.resetModules()
        const { addAdminMember } = await import('../admin-management')
        const result = await addAdminMember('newadmin@b2bnetwork.pl', 'Nowy Admin')
        expect(result).toEqual({ success: true })
        const row = currentClient._tables.admin_access_list[0]
        expect(row.email).toBe('newadmin@b2bnetwork.pl')
        expect(row.full_name).toBe('Nowy Admin')
        expect(row.added_by).toBe('u-super')
    })

    it('REJECTS uppercase domain (case-sensitive endsWith — possible bug to fix later)', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({ user: { id: 'u-super', email: 'super@b2bnetwork.pl' } })
        vi.resetModules()
        const { addAdminMember } = await import('../admin-management')
        // Currently rejects mixed-case @B2BNetwork.pl due to plain endsWith() check.
        // Documented as known behaviour — fix would be to lowercase first, then compare.
        await expect(addAdminMember('user@B2BNetwork.pl')).rejects.toThrow(/@b2bnetwork\.pl/)
    })

    it('promotes existing centrala member to admin (removes from centrala_access_list)', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({
            user: { id: 'u-super', email: 'super@b2bnetwork.pl' },
            tables: {
                admin_access_list: [],
                centrala_access_list: [{ id: 'cl1', email: 'promote@b2bnetwork.pl' }],
                profiles: [],
            },
        })
        vi.resetModules()
        const { addAdminMember } = await import('../admin-management')
        await addAdminMember('promote@b2bnetwork.pl')
        // Centrala entry deleted
        expect(currentClient._tables.centrala_access_list).toHaveLength(0)
        // Admin entry inserted
        expect(currentClient._tables.admin_access_list).toHaveLength(1)
    })

    it('updates profile.role to "administrator" when user already has a profile', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({
            user: { id: 'u-super', email: 'super@b2bnetwork.pl' },
            tables: {
                admin_access_list: [],
                centrala_access_list: [],
                profiles: [{ id: 'profile-uuid', email: 'existing@b2bnetwork.pl', role: 'consultant' }],
            },
        })
        vi.resetModules()
        const { addAdminMember } = await import('../admin-management')
        await addAdminMember('existing@b2bnetwork.pl')
        const profile = currentClient._tables.profiles[0]
        expect(profile.role).toBe('administrator')
    })
})

describe('removeAdminMember', () => {
    it('deletes the row + downgrades existing profile to consultant', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({
            user: { id: 'u-super', email: 'super@b2bnetwork.pl' },
            tables: {
                admin_access_list: [{ id: 'a1', email: 'admin@b2bnetwork.pl' }],
                profiles: [{ id: 'profile-uuid', email: 'admin@b2bnetwork.pl', role: 'administrator' }],
            },
        })
        vi.resetModules()
        const { removeAdminMember } = await import('../admin-management')
        await removeAdminMember('a1')
        expect(currentClient._tables.admin_access_list).toHaveLength(0)
        expect(currentClient._tables.profiles[0].role).toBe('consultant')
    })
})

describe('checkIsSuperAdmin', () => {
    it('returns false when not authenticated', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({ user: null })
        vi.resetModules()
        const { checkIsSuperAdmin } = await import('../admin-management')
        expect(await checkIsSuperAdmin()).toBe(false)
    })

    it('returns true for super admin email', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@b2bnetwork.pl'
        setup({ user: { id: 'u-super', email: 'super@b2bnetwork.pl' } })
        vi.resetModules()
        const { checkIsSuperAdmin } = await import('../admin-management')
        expect(await checkIsSuperAdmin()).toBe(true)
    })
})
