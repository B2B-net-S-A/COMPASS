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

describe('deleteProject', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { deleteProject } = await import('../projects')
        await expect(deleteProject('p1')).rejects.toThrow('Unauthorized')
    })

    it('deletes the project row', async () => {
        setup({
            user: { id: 'u1', email: 'a@x.com' },
            tables: { projects: [{ id: 'p1', title: 'X', file_url: null }, { id: 'p2', title: 'Y' }] },
        })
        const { deleteProject } = await import('../projects')
        await deleteProject('p1')
        expect(currentClient._tables.projects.map((p: any) => p.id)).toEqual(['p2'])
    })

    it('also removes file from storage when file_url present', async () => {
        const removeMock = vi.fn(async () => ({ error: null }))
        setup({
            user: { id: 'u1', email: 'a@x.com' },
            tables: { projects: [{ id: 'p1', title: 'X', file_url: 'project-spec.pdf' }] },
            storage: {
                documents: { upload: vi.fn(), download: vi.fn(), getPublicUrl: vi.fn(), remove: removeMock as any } as any,
            },
        })
        // Override storage.from to return our mock with remove
        currentClient.storage.from = vi.fn(() => ({
            upload: vi.fn(async () => ({ data: { path: 'mock-path' }, error: null })),
            download: vi.fn(async () => ({ data: new Blob(['mock']), error: null })),
            getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'mock' } })),
            remove: removeMock,
        })) as unknown as typeof currentClient.storage.from
        const { deleteProject } = await import('../projects')
        await deleteProject('p1')
        expect(removeMock).toHaveBeenCalledWith(['project-spec.pdf'])
    })
})

describe('deleteProjects (bulk)', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { deleteProjects } = await import('../projects')
        await expect(deleteProjects(['p1'])).rejects.toThrow('Unauthorized')
    })

    it('deletes multiple projects by id', async () => {
        setup({
            user: { id: 'u1', email: 'a@x.com' },
            tables: { projects: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] },
        })
        const { deleteProjects } = await import('../projects')
        await deleteProjects(['p1', 'p3'])
        expect(currentClient._tables.projects.map((p: any) => p.id)).toEqual(['p2'])
    })
})

describe('updateProject', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { updateProject } = await import('../projects')
        await expect(updateProject('p1', { title: 'New' })).rejects.toThrow('Unauthorized')
    })

    it('updates project fields', async () => {
        setup({
            user: { id: 'u1', email: 'a@x.com' },
            tables: { projects: [{ id: 'p1', title: 'Old', description: 'old' }] },
        })
        const { updateProject } = await import('../projects')
        await updateProject('p1', { title: 'New title', description: 'New desc' })
        const row = currentClient._tables.projects[0]
        expect(row.title).toBe('New title')
        expect(row.description).toBe('New desc')
    })
})
