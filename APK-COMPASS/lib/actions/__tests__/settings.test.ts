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

describe('getSystemSetting', () => {
    it('returns the value when row exists', async () => {
        setup({
            tables: { system_settings: [{ key: 'notification_email', value: 'admin@b2bnetwork.pl' }] },
        })
        const { getSystemSetting } = await import('../settings')
        expect(await getSystemSetting('notification_email')).toBe('admin@b2bnetwork.pl')
    })

    it('returns null when row does not exist', async () => {
        setup({ tables: { system_settings: [] } })
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { getSystemSetting } = await import('../settings')
        expect(await getSystemSetting('missing_key')).toBeNull()
        err.mockRestore()
    })
})

describe('updateSystemSetting', () => {
    it('throws Unauthorized when not signed in', async () => {
        setup({ user: null })
        const { updateSystemSetting } = await import('../settings')
        await expect(updateSystemSetting('k', 'v')).rejects.toThrow('Unauthorized')
    })

    it('throws when caller is not admin/centrala/administrator', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }], system_settings: [] },
        })
        const { updateSystemSetting } = await import('../settings')
        await expect(updateSystemSetting('k', 'v')).rejects.toThrow(/Only administrators/)
    })

    it.each(['admin', 'administrator', 'centrala'])('allows %s to upsert a setting', async (role) => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', role }], system_settings: [] },
        })
        const { updateSystemSetting } = await import('../settings')
        const result = await updateSystemSetting('notification_email', 'a@b.pl')
        expect(result).toEqual({ success: true })
        const row = currentClient._tables.system_settings[0]
        expect(row.key).toBe('notification_email')
        expect(row.value).toBe('a@b.pl')
        expect(row.updated_by).toBe('u1')
    })
})

describe('getAllSystemSettings (admin only)', () => {
    it('throws Unauthorized when not signed in', async () => {
        setup({ user: null })
        const { getAllSystemSettings } = await import('../settings')
        await expect(getAllSystemSettings()).rejects.toThrow('Unauthorized')
    })

    it('throws when caller is consultant', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getAllSystemSettings } = await import('../settings')
        await expect(getAllSystemSettings()).rejects.toThrow(/Only administrators/)
    })

    it('returns all settings for admin sorted by key', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                system_settings: [
                    { key: 'zebra', value: '1' },
                    { key: 'alpha', value: '2' },
                    { key: 'middle', value: '3' },
                ],
            },
        })
        const { getAllSystemSettings } = await import('../settings')
        const result = await getAllSystemSettings()
        expect(result.map((r: any) => r.key)).toEqual(['alpha', 'middle', 'zebra'])
    })
})
