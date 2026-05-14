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

describe('addFavoriteProject', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { addFavoriteProject } = await import('../favorites')
        await expect(addFavoriteProject('p1')).rejects.toThrow('Unauthorized')
    })

    it('inserts a new favorite_projects row', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { favorite_projects: [] },
        })
        const { addFavoriteProject } = await import('../favorites')
        const result = await addFavoriteProject('p1', 'love it')
        expect(result.success).toBe(true)
        const row = currentClient._tables.favorite_projects[0]
        expect(row.user_id).toBe('u1')
        expect(row.project_id).toBe('p1')
        expect(row.note).toBe('love it')
    })

    it('inserts with null note when note not provided', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { favorite_projects: [] },
        })
        const { addFavoriteProject } = await import('../favorites')
        await addFavoriteProject('p1')
        expect(currentClient._tables.favorite_projects[0].note).toBeNull()
    })
})

describe('removeFavoriteProject', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { removeFavoriteProject } = await import('../favorites')
        await expect(removeFavoriteProject('p1')).rejects.toThrow('Unauthorized')
    })

    it('removes the row matching user_id+project_id', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                favorite_projects: [
                    { id: 'f1', user_id: 'u1', project_id: 'p1', note: null },
                    { id: 'f2', user_id: 'u1', project_id: 'p2', note: null },
                ],
            },
        })
        const { removeFavoriteProject } = await import('../favorites')
        await removeFavoriteProject('p1')
        expect(currentClient._tables.favorite_projects.map((f: any) => f.project_id)).toEqual(['p2'])
    })

    it('does not remove other users favorites (RLS-like isolation)', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                favorite_projects: [
                    { id: 'f1', user_id: 'u2', project_id: 'p1', note: null },
                ],
            },
        })
        const { removeFavoriteProject } = await import('../favorites')
        await removeFavoriteProject('p1')
        expect(currentClient._tables.favorite_projects).toHaveLength(1)
    })
})

describe('toggleFavoriteProject', () => {
    it('adds when not yet favorited (returns is_favorite=true)', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { favorite_projects: [] },
        })
        const { toggleFavoriteProject } = await import('../favorites')
        const result = await toggleFavoriteProject('p1')
        expect(result).toEqual({ success: true, is_favorite: true })
        expect(currentClient._tables.favorite_projects).toHaveLength(1)
    })

    it('removes when already favorited (returns is_favorite=false)', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                favorite_projects: [
                    { id: 'f1', user_id: 'u1', project_id: 'p1', note: null },
                ],
            },
        })
        const { toggleFavoriteProject } = await import('../favorites')
        const result = await toggleFavoriteProject('p1')
        expect(result).toEqual({ success: true, is_favorite: false })
        expect(currentClient._tables.favorite_projects).toHaveLength(0)
    })
})

describe('getMyFavoriteProjects', () => {
    it('returns [] when not signed in', async () => {
        setup({ user: null })
        const { getMyFavoriteProjects } = await import('../favorites')
        expect(await getMyFavoriteProjects()).toEqual([])
    })

    it('returns only own favorites sorted by created_at desc (RLS-like)', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                favorite_projects: [
                    { id: 'f1', user_id: 'u1', project_id: 'p1', note: null, created_at: '2026-01-01' },
                    { id: 'f2', user_id: 'u2', project_id: 'p2', note: null, created_at: '2026-04-01' },
                    { id: 'f3', user_id: 'u1', project_id: 'p3', note: null, created_at: '2026-04-15' },
                ],
            },
        })
        const { getMyFavoriteProjects } = await import('../favorites')
        const result = await getMyFavoriteProjects()
        expect(result.map(f => f.id)).toEqual(['f3', 'f1'])
    })
})

describe('getUserFavoriteProjects (no auth required — admin reads any user)', () => {
    it('returns favorites for arbitrary userId', async () => {
        setup({
            tables: {
                favorite_projects: [
                    { id: 'f1', user_id: 'u-other', project_id: 'p1', note: null, created_at: '2026-04-01' },
                ],
            },
        })
        const { getUserFavoriteProjects } = await import('../favorites')
        const result = await getUserFavoriteProjects('u-other')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('f1')
    })
})

describe('getMyFavoriteProjectIds', () => {
    it('returns [] when not signed in', async () => {
        setup({ user: null })
        const { getMyFavoriteProjectIds } = await import('../favorites')
        expect(await getMyFavoriteProjectIds()).toEqual([])
    })

    it('returns only project_ids', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                favorite_projects: [
                    { id: 'f1', user_id: 'u1', project_id: 'p1' },
                    { id: 'f2', user_id: 'u1', project_id: 'p2' },
                ],
            },
        })
        const { getMyFavoriteProjectIds } = await import('../favorites')
        const ids = await getMyFavoriteProjectIds()
        expect(ids.sort()).toEqual(['p1', 'p2'])
    })
})

describe('updateFavoriteNote', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { updateFavoriteNote } = await import('../favorites')
        await expect(updateFavoriteNote('p1', 'note')).rejects.toThrow('Unauthorized')
    })

    it('updates the note for own favorite', async () => {
        setup({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                favorite_projects: [
                    { id: 'f1', user_id: 'u1', project_id: 'p1', note: 'old' },
                ],
            },
        })
        const { updateFavoriteNote } = await import('../favorites')
        await updateFavoriteNote('p1', 'new note')
        expect(currentClient._tables.favorite_projects[0].note).toBe('new note')
    })
})
