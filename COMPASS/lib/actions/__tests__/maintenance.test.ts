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

describe('cleanDuplicateCandidates', () => {
    it('returns count=0 with friendly message when there are no candidates', async () => {
        setup({ tables: { candidates: [] } })
        const { cleanDuplicateCandidates } = await import('../maintenance')
        const result = await cleanDuplicateCandidates()
        expect(result.count).toBe(0)
        expect(result.message).toMatch(/Brak kandydatów/i)
    })

    it('returns 0 deletions when there are no duplicate emails', async () => {
        setup({
            tables: {
                candidates: [
                    { id: 'c1', email: 'a@x.com', full_name: 'A', skills: ['React'], created_at: '2026-01-01' },
                    { id: 'c2', email: 'b@x.com', full_name: 'B', skills: ['Java'], created_at: '2026-02-01' },
                ],
            },
        })
        const { cleanDuplicateCandidates } = await import('../maintenance')
        const result = await cleanDuplicateCandidates()
        expect(result.count).toBe(0)
        expect(currentClient._tables.candidates).toHaveLength(2)
    })

    it('merges skills + deletes newer duplicate when 2 candidates share email', async () => {
        setup({
            tables: {
                candidates: [
                    { id: 'master', email: 'jan@x.com', full_name: 'Jan', skills: ['React'], created_at: '2026-01-01' },
                    { id: 'duplicate', email: 'jan@x.com', full_name: 'Jan K.', skills: ['Java', 'Spring'], created_at: '2026-02-01' },
                ],
            },
        })
        const { cleanDuplicateCandidates } = await import('../maintenance')
        const result = await cleanDuplicateCandidates()
        expect(result.count).toBe(1)
        expect(result.message).toMatch(/Sukces.*1 duplikat/i)
        // Master remains with merged skills
        const remaining = currentClient._tables.candidates
        expect(remaining).toHaveLength(1)
        expect(remaining[0].id).toBe('master')
        expect(remaining[0].skills as string[]).toEqual(expect.arrayContaining(['React', 'Java', 'Spring']))
    })

    it('handles email case-insensitively (Jan@X.COM === jan@x.com)', async () => {
        setup({
            tables: {
                candidates: [
                    { id: 'master', email: 'Jan@X.COM', full_name: 'Jan', skills: ['A'], created_at: '2026-01-01' },
                    { id: 'dup', email: 'jan@x.com', full_name: 'Jan K.', skills: ['B'], created_at: '2026-02-01' },
                ],
            },
        })
        const { cleanDuplicateCandidates } = await import('../maintenance')
        const result = await cleanDuplicateCandidates()
        expect(result.count).toBe(1)
    })

    it('does NOT touch candidates with null email (no grouping key)', async () => {
        setup({
            tables: {
                candidates: [
                    { id: 'c1', email: null, full_name: 'X', skills: [], created_at: '2026-01-01' },
                    { id: 'c2', email: null, full_name: 'Y', skills: [], created_at: '2026-02-01' },
                ],
            },
        })
        const { cleanDuplicateCandidates } = await import('../maintenance')
        const result = await cleanDuplicateCandidates()
        expect(result.count).toBe(0)
        expect(currentClient._tables.candidates).toHaveLength(2)
    })

    it('keeps the OLDEST candidate as master, deletes the newer ones', async () => {
        setup({
            tables: {
                candidates: [
                    { id: 'old', email: 'a@x.com', full_name: 'A', skills: ['s1'], created_at: '2025-01-01' },
                    { id: 'mid', email: 'a@x.com', full_name: 'A', skills: ['s2'], created_at: '2026-01-01' },
                    { id: 'new', email: 'a@x.com', full_name: 'A', skills: ['s3'], created_at: '2026-04-01' },
                ],
            },
        })
        const { cleanDuplicateCandidates } = await import('../maintenance')
        const result = await cleanDuplicateCandidates()
        expect(result.count).toBe(2)
        const remaining = currentClient._tables.candidates
        expect(remaining).toHaveLength(1)
        expect(remaining[0].id).toBe('old')
    })
})
