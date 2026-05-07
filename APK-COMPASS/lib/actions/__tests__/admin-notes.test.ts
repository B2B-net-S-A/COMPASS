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

describe('addAdminNote', () => {
    it('rejects when not signed in', async () => {
        setup({ user: null })
        const { addAdminNote } = await import('../admin-notes')
        expect(await addAdminNote('c1', 'note', 'general')).toMatchObject({ success: false })
    })

    it('rejects when caller is consultant', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant', full_name: 'C' }] },
        })
        const { addAdminNote } = await import('../admin-notes')
        const result = await addAdminNote('c1', 'note', 'general')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/uprawnie/)
    })

    it.each(['admin'])('allows %s to add note to a profile', async (role) => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role, full_name: 'Admin' },
                    { id: 'c1', admin_notes: [] },
                ],
            },
        })
        const { addAdminNote } = await import('../admin-notes')
        const result = await addAdminNote('c1', 'first note', 'general')
        expect(result.success).toBe(true)
        const row = currentClient._tables.profiles.find((p: any) => p.id === 'c1')
        expect((row?.admin_notes as any[])).toHaveLength(1)
        expect((row?.admin_notes as any[])[0].content).toBe('first note')
        expect((row?.admin_notes as any[])[0].author_id).toBe('u-admin')
    })

    it('appends note to existing list (does not replace)', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role: 'admin', full_name: 'Admin' },
                    { id: 'c1', admin_notes: [{ content: 'pre-existing', author_id: 'old' }] },
                ],
            },
        })
        const { addAdminNote } = await import('../admin-notes')
        await addAdminNote('c1', 'new', 'general')
        const row = currentClient._tables.profiles.find((p: any) => p.id === 'c1')
        expect((row?.admin_notes as any[])).toHaveLength(2)
    })
})

describe('getAdminNotes', () => {
    it('rejects when not signed in', async () => {
        setup({ user: null })
        const { getAdminNotes } = await import('../admin-notes')
        const result = await getAdminNotes('c1')
        expect(result.success).toBe(false)
    })

    it('rejects when caller is consultant', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getAdminNotes } = await import('../admin-notes')
        const result = await getAdminNotes('c1')
        expect(result.success).toBe(false)
    })

    it('returns notes array for admin', async () => {
        const notes = [{ content: 'a', author_id: 'admin' }, { content: 'b', author_id: 'admin' }]
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role: 'admin' },
                    { id: 'c1', admin_notes: notes },
                ],
            },
        })
        const { getAdminNotes } = await import('../admin-notes')
        const result = await getAdminNotes('c1') as { success: true; notes: typeof notes }
        expect(result.success).toBe(true)
        expect(result.notes).toEqual(notes)
    })

    it('returns empty notes when admin_notes column is null', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role: 'admin' },
                    { id: 'c1', admin_notes: null },
                ],
            },
        })
        const { getAdminNotes } = await import('../admin-notes')
        const result = await getAdminNotes('c1') as { success: true; notes: unknown[] }
        expect(result.notes).toEqual([])
    })
})
