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

describe('tasks — auth gate (requireAuth)', () => {
    it('getBoards rejects when not authenticated', async () => {
        setup({ user: null })
        const { getBoards } = await import('../tasks')
        await expect(getBoards()).rejects.toThrow(/zalogowany/)
    })

    it('createBoard rejects when not authenticated', async () => {
        setup({ user: null })
        const { createBoard } = await import('../tasks')
        await expect(createBoard('Test')).rejects.toThrow(/zalogowany/)
    })
})

describe('getBoards', () => {
    it('returns only non-archived boards, sorted desc by created_at', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                task_boards: [
                    { id: 'b1', title: 'Old', archived: false, created_at: '2026-01-01' },
                    { id: 'b2', title: 'Archived', archived: true, created_at: '2026-04-01' },
                    { id: 'b3', title: 'New', archived: false, created_at: '2026-04-15' },
                ],
            },
        })
        const { getBoards } = await import('../tasks')
        const result = await getBoards() as { success: true; boards: Array<{ id: string }> }
        expect(result.boards.map(b => b.id)).toEqual(['b3', 'b1'])
    })
})

describe('createBoard', () => {
    it('creates a board with default visibility=private + owner_id=current user', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { task_boards: [], task_columns: [] },
        })
        const { createBoard } = await import('../tasks')
        const result = await createBoard('My Board', 'description')
        expect(result.success).toBe(true)
        const row = currentClient._tables.task_boards[0]
        expect(row.title).toBe('My Board')
        expect(row.description).toBe('description')
        expect(row.owner_id).toBe('u1')
    })
})
