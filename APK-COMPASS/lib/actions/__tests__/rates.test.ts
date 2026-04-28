import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('@/lib/ai/llm', () => ({
    chatText: vi.fn(async () => 'mock LLM summary'),
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('getRateChangeLog (Faza 6.4 audit log)', () => {
    it('throws when caller is not admin/centrala', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getRateChangeLog } = await import('../rates')
        await expect(getRateChangeLog()).rejects.toThrow(/Brak dostępu/)
    })

    it.each(['admin', 'administrator', 'centrala'])('allows %s role to read the log', async (role) => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role }],
                rate_change_log: [],
            },
        })
        const { getRateChangeLog } = await import('../rates')
        const result = await getRateChangeLog()
        expect(result).toEqual([])
    })

    it('returns log entries sorted desc by changed_at', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                rate_change_log: [
                    { id: 'l1', rate_id: 'r1', action: 'INSERT', changed_by: null, changed_at: '2026-01-01T00:00:00Z', position_title: 'Dev', new_rate_min: 100, new_rate_median: 150, new_rate_max: 200 },
                    { id: 'l2', rate_id: 'r1', action: 'UPDATE', changed_by: null, changed_at: '2026-04-01T00:00:00Z', position_title: 'Dev', old_rate_min: 100, new_rate_min: 110, old_rate_median: 150, new_rate_median: 170, old_rate_max: 200, new_rate_max: 220 },
                    { id: 'l3', rate_id: 'r1', action: 'DELETE', changed_by: null, changed_at: '2026-03-01T00:00:00Z', position_title: 'Dev', old_rate_min: 110, old_rate_median: 170, old_rate_max: 220 },
                ],
            },
        })
        const { getRateChangeLog } = await import('../rates')
        const result = await getRateChangeLog()
        expect(result.map(r => r.id)).toEqual(['l2', 'l3', 'l1'])
    })

    it('filters by rateId when provided', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                rate_change_log: [
                    { id: 'l1', rate_id: 'r1', action: 'INSERT', changed_by: null, changed_at: '2026-01-01T00:00:00Z', position_title: 'A', new_rate_min: 1, new_rate_median: 2, new_rate_max: 3 },
                    { id: 'l2', rate_id: 'r2', action: 'INSERT', changed_by: null, changed_at: '2026-02-01T00:00:00Z', position_title: 'B', new_rate_min: 1, new_rate_median: 2, new_rate_max: 3 },
                    { id: 'l3', rate_id: 'r1', action: 'UPDATE', changed_by: null, changed_at: '2026-03-01T00:00:00Z', position_title: 'A', old_rate_min: 1, new_rate_min: 2, old_rate_median: 2, new_rate_median: 3, old_rate_max: 3, new_rate_max: 4 },
                ],
            },
        })
        const { getRateChangeLog } = await import('../rates')
        const result = await getRateChangeLog('r1')
        expect(result.map(r => r.id).sort()).toEqual(['l1', 'l3'])
    })

    it('respects the limit parameter', async () => {
        const entries = Array.from({ length: 30 }, (_, i) => ({
            id: `l${i}`, rate_id: 'r1', action: 'INSERT' as const, changed_by: null,
            changed_at: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
            position_title: 'Dev', new_rate_min: 100, new_rate_median: 150, new_rate_max: 200,
        }))
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                rate_change_log: entries,
            },
        })
        const { getRateChangeLog } = await import('../rates')
        const result = await getRateChangeLog(undefined, 5)
        expect(result).toHaveLength(5)
    })

    it('hydrates actor_name + actor_email from profiles for entries with changed_by', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role: 'admin', full_name: 'Admin User', email: 'a@x.com' },
                    { id: 'u-other', role: 'admin', full_name: 'Editor', email: 'editor@x.com' },
                ],
                rate_change_log: [
                    { id: 'l1', rate_id: 'r1', action: 'INSERT', changed_by: 'u-other', changed_at: '2026-04-01T00:00:00Z', position_title: 'Dev', new_rate_min: 100, new_rate_median: 150, new_rate_max: 200 },
                ],
            },
        })
        const { getRateChangeLog } = await import('../rates')
        const result = await getRateChangeLog()
        expect(result[0].actor_name).toBe('Editor')
        expect(result[0].actor_email).toBe('editor@x.com')
    })

    it('does not crash when changed_by is null (system / trigger-driven entry)', async () => {
        setup({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                rate_change_log: [
                    { id: 'l1', rate_id: 'r1', action: 'INSERT', changed_by: null, changed_at: '2026-04-01T00:00:00Z', position_title: 'Dev', new_rate_min: 100, new_rate_median: 150, new_rate_max: 200 },
                ],
            },
        })
        const { getRateChangeLog } = await import('../rates')
        const result = await getRateChangeLog()
        expect(result).toHaveLength(1)
        expect(result[0].actor_name).toBeUndefined()
    })
})
