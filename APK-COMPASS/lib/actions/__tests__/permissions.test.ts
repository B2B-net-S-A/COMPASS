import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'
import { DEFAULT_PERMISSIONS } from '@/lib/types/permissions'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react')
    return { ...actual, cache: <T extends (...args: any[]) => any>(fn: T) => fn }
})

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('getPermissions', () => {
    it('returns DEFAULT_PERMISSIONS when role_permissions table is empty', async () => {
        setup({ tables: { role_permissions: [] } })
        const { getPermissions } = await import('../permissions')
        const result = await getPermissions()
        expect(result.consultant.candidates).toBe(DEFAULT_PERMISSIONS.consultant.candidates)
        expect(result.recruiter.candidates).toBe(DEFAULT_PERMISSIONS.recruiter.candidates)
    })

    it('overlays DB rows on top of DEFAULT_PERMISSIONS', async () => {
        setup({
            tables: {
                role_permissions: [
                    { role: 'consultant', feature: 'candidates', value: 'readonly' },
                    { role: 'recruiter', feature: 'settings', value: 'true' },
                ],
            },
        })
        const { getPermissions } = await import('../permissions')
        const result = await getPermissions()
        expect(result.consultant.candidates).toBe('readonly')
        expect(result.recruiter.settings).toBe('true')
        // Other features remain at default
        expect(result.consultant.dashboard).toBe(DEFAULT_PERMISSIONS.consultant.dashboard)
    })

    it('ignores invalid role/feature/value combinations from DB', async () => {
        setup({
            tables: {
                role_permissions: [
                    { role: 'evil_role', feature: 'candidates', value: 'true' },
                    { role: 'consultant', feature: 'unknown_feature', value: 'true' },
                    { role: 'consultant', feature: 'candidates', value: 'INVALID_VALUE' },
                ],
            },
        })
        const { getPermissions } = await import('../permissions')
        const result = await getPermissions()
        // Bad rows did not corrupt the map — defaults preserved
        expect(result.consultant.candidates).toBe(DEFAULT_PERMISSIONS.consultant.candidates)
    })
})

describe('updatePermissions', () => {
    it('throws Brak autoryzacji when not signed in', async () => {
        setup({ user: null })
        const { updatePermissions } = await import('../permissions')
        await expect(updatePermissions([{ role: 'consultant', feature: 'candidates', value: 'true' }])).rejects.toThrow('Brak autoryzacji')
    })

    it('throws when caller is consultant (admin-only)', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { updatePermissions } = await import('../permissions')
        await expect(updatePermissions([{ role: 'consultant', feature: 'candidates', value: 'true' }])).rejects.toThrow(/Wymagany dostęp administratora/)
    })

    it('returns success immediately on empty updates list', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: { profiles: [{ id: 'u-admin', role: 'admin' }] },
        })
        const { updatePermissions } = await import('../permissions')
        const result = await updatePermissions([])
        expect(result).toEqual({ success: true })
    })

    it('upserts rows for admin updates', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                role_permissions: [],
            },
        })
        const { updatePermissions } = await import('../permissions')
        const result = await updatePermissions([
            { role: 'consultant', feature: 'candidates', value: 'readonly' },
            { role: 'recruiter', feature: 'rates', value: 'false' },
        ])
        expect(result).toEqual({ success: true })
        expect(currentClient._tables.role_permissions).toHaveLength(2)
        const consultantRow = currentClient._tables.role_permissions.find((r: any) => r.role === 'consultant')
        expect(consultantRow?.feature).toBe('candidates')
        expect(consultantRow?.value).toBe('readonly')
        expect(consultantRow?.updated_by).toBe('u-admin')
    })
})
