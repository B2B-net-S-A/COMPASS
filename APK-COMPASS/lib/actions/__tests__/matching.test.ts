import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'
import { deterministicEmbedding } from '@/test/mocks/voyage'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('@/lib/ai/embeddings', () => ({
    generateEmbedding: vi.fn(async (text: string) => deterministicEmbedding(text)),
}))

function setupClient(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('matchProjectsForUser', () => {
    it('throws when profile not found', async () => {
        setupClient({ tables: { profiles: [] } })
        const { matchProjectsForUser } = await import('../matching')
        await expect(matchProjectsForUser('missing-user')).rejects.toThrow('Profile not found')
    })

    it('returns empty array when profile has no embedding and no bio', async () => {
        setupClient({
            tables: { profiles: [{ id: 'u1', bio: null, embedding: null }] },
        })
        const { matchProjectsForUser } = await import('../matching')
        const result = await matchProjectsForUser('u1')
        expect(result).toEqual([])
    })

    it('generates embedding from bio if missing, then queries match_projects', async () => {
        const matchProjectsRpc = vi.fn(async (args: Record<string, unknown>) => {
            expect(args.match_threshold).toBe(0.5)
            expect(args.match_count).toBe(5)
            expect(Array.isArray(args.query_embedding)).toBe(true)
            return [{ id: 'p1', name: 'Project 1', similarity: 0.9 }]
        })
        setupClient({
            tables: {
                profiles: [{ id: 'u1', bio: 'React senior 8y', embedding: null }],
            },
            rpcs: { match_projects: matchProjectsRpc },
        })
        const { matchProjectsForUser } = await import('../matching')
        const result = await matchProjectsForUser('u1')
        expect(result).toEqual([{ id: 'p1', name: 'Project 1', similarity: 0.9 }])
        expect(matchProjectsRpc).toHaveBeenCalledOnce()
    })

    it('skips embedding generation when profile already has one', async () => {
        const existing = deterministicEmbedding('existing')
        setupClient({
            tables: { profiles: [{ id: 'u1', bio: 'x', embedding: existing }] },
            rpcs: { match_projects: async () => [{ id: 'p1', similarity: 0.7 }] },
        })
        const embeddingMod = await import('@/lib/ai/embeddings')
        const { matchProjectsForUser } = await import('../matching')
        await matchProjectsForUser('u1')
        expect(embeddingMod.generateEmbedding).not.toHaveBeenCalled()
    })

    it('uses default limit=5 and supports custom limit', async () => {
        const rpc = vi.fn(async () => [])
        setupClient({
            tables: { profiles: [{ id: 'u1', bio: null, embedding: deterministicEmbedding('x') }] },
            rpcs: { match_projects: rpc },
        })
        const { matchProjectsForUser } = await import('../matching')
        await matchProjectsForUser('u1')
        expect((rpc.mock.calls[0] as unknown[])[0]).toMatchObject({ match_count: 5 })
        await matchProjectsForUser('u1', 12)
        expect((rpc.mock.calls[1] as unknown[])[0]).toMatchObject({ match_count: 12 })
    })

    it('returns [] (does not throw) when match_projects RPC errors', async () => {
        setupClient({
            tables: { profiles: [{ id: 'u1', bio: null, embedding: deterministicEmbedding('x') }] },
        })
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { matchProjectsForUser } = await import('../matching')
        const result = await matchProjectsForUser('u1')
        expect(result).toEqual([])
        expect(err).toHaveBeenCalledWith('Error matching projects:', expect.any(Object))
        err.mockRestore()
    })
})

describe('updateUserBio', () => {
    it('throws when user is not authenticated', async () => {
        setupClient({ user: null })
        const { updateUserBio } = await import('../matching')
        await expect(updateUserBio('new bio')).rejects.toThrow('Not authenticated')
    })

    it('regenerates embedding from bio and writes both fields', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { profiles: [{ id: 'u1', bio: 'old', embedding: null }] },
        })
        const { updateUserBio } = await import('../matching')
        const result = await updateUserBio('new bio content')
        expect(result).toEqual({ success: true })
        const embeddingMod = await import('@/lib/ai/embeddings')
        expect(embeddingMod.generateEmbedding).toHaveBeenCalledWith('new bio content')
        const updated = currentClient._tables.profiles[0]
        expect(updated.bio).toBe('new bio content')
        expect(Array.isArray(updated.embedding)).toBe(true)
    })
})

describe('updateProfileFull', () => {
    it('returns error when not authenticated', async () => {
        setupClient({ user: null })
        const { updateProfileFull } = await import('../matching')
        const result = await updateProfileFull({ bio: 'x' })
        expect(result).toEqual({ success: false, error: 'Nie jesteś zalogowany.' })
    })

    it('regenerates embedding when bio changes', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { profiles: [{ id: 'u1', bio: 'old' }], candidates: [{ id: 'c1', user_id: 'u1', email: 'u@x.com' }] },
        })
        const { updateProfileFull } = await import('../matching')
        const r = await updateProfileFull({ bio: 'fresh bio' })
        expect(r.success).toBe(true)
        const embeddingMod = await import('@/lib/ai/embeddings')
        expect(embeddingMod.generateEmbedding).toHaveBeenCalledWith('fresh bio')
    })

    it('coerces empty available_from to null (DATE column safety)', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { profiles: [{ id: 'u1' }], candidates: [{ id: 'c1', user_id: 'u1' }] },
        })
        const { updateProfileFull } = await import('../matching')
        await updateProfileFull({ available_from: '' })
        const updated = currentClient._tables.profiles[0]
        expect(updated.available_from).toBeNull()
    })

    it('does NOT regenerate embedding when bio is unchanged (omitted)', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { profiles: [{ id: 'u1' }], candidates: [{ id: 'c1', user_id: 'u1' }] },
        })
        const { updateProfileFull } = await import('../matching')
        await updateProfileFull({ full_name: 'Jan Kowalski' })
        const embeddingMod = await import('@/lib/ai/embeddings')
        expect(embeddingMod.generateEmbedding).not.toHaveBeenCalled()
    })
})

describe('searchCandidatesByName', () => {
    it('returns [] for queries shorter than 2 chars', async () => {
        setupClient({ user: { id: 'u1', email: 'x@x.com' } })
        const { searchCandidatesByName } = await import('../matching')
        expect(await searchCandidatesByName('')).toEqual([])
        expect(await searchCandidatesByName(' ')).toEqual([])
        expect(await searchCandidatesByName('a')).toEqual([])
    })

    it('throws when not authenticated', async () => {
        setupClient({ user: null })
        const { searchCandidatesByName } = await import('../matching')
        await expect(searchCandidatesByName('Jan')).rejects.toThrow('Not authenticated')
    })

    it('masks emails in returned results (privacy)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                candidates: [
                    { id: 'c1', full_name: 'Jan Kowalski', email: 'jan.kowalski@example.com', candidate_status: 'kandydat', skills: ['React', 'TS'], bio: 'Senior dev with extensive experience in modern stacks', cv_url: '/cv/c1.pdf', created_at: '2026-01-01', original_filename: 'cv.pdf' },
                ],
            },
        })
        const { searchCandidatesByName } = await import('../matching')
        const result = await searchCandidatesByName('Jan')
        expect(result.length).toBeGreaterThan(0)
        expect(result[0].email).toBe('ja***@example.com')
    })

    it('filters out non-kandydat statuses', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                candidates: [
                    { id: 'c1', full_name: 'Jan A', email: 'a@x.com', candidate_status: 'konsultant' },
                    { id: 'c2', full_name: 'Jan B', email: 'b@x.com', candidate_status: 'kandydat', skills: [], bio: null, created_at: '2026', cv_url: null, original_filename: null },
                ],
            },
        })
        const { searchCandidatesByName } = await import('../matching')
        const result = await searchCandidatesByName('Jan')
        expect(result.map(r => r.id)).toEqual(['c2'])
    })

    it('truncates bio to 150 chars + ellipsis', async () => {
        const longBio = 'x'.repeat(500)
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                candidates: [{ id: 'c1', full_name: 'Jan Kowalski', email: 'a@x.com', candidate_status: 'kandydat', skills: [], bio: longBio, created_at: '2026', cv_url: null, original_filename: null }],
            },
        })
        const { searchCandidatesByName } = await import('../matching')
        const result = await searchCandidatesByName('Jan')
        expect(result[0].bio_snippet).toBe('x'.repeat(150) + '...')
    })

    it('limits skills to 5', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                candidates: [{ id: 'c1', full_name: 'Jan Kowalski', email: 'a@x.com', candidate_status: 'kandydat', skills: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'], bio: null, created_at: '2026', cv_url: null, original_filename: null }],
            },
        })
        const { searchCandidatesByName } = await import('../matching')
        const result = await searchCandidatesByName('Jan')
        expect(result[0].skills).toEqual(['s1', 's2', 's3', 's4', 's5'])
    })
})

describe('completeOnboarding', () => {
    it('sets cookie and updates profiles.onboarding_completed=true', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { profiles: [{ id: 'u1', onboarding_completed: false }] },
        })
        const { completeOnboarding } = await import('../matching')
        const result = await completeOnboarding()
        expect(result).toEqual({ success: true })
        expect(currentClient._tables.profiles[0].onboarding_completed).toBe(true)
    })
})

describe('claimCandidate', () => {
    it('rejects when candidate not found', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { candidates: [] },
        })
        const { claimCandidate } = await import('../matching')
        const result = await claimCandidate('missing')
        expect(result).toEqual({ success: false, error: 'Kandydat nie znaleziony.' })
    })

    it('rejects when candidate already has user_id (already claimed)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { candidates: [{ id: 'c1', user_id: 'someone-else', candidate_status: 'kandydat' }] },
        })
        const { claimCandidate } = await import('../matching')
        const result = await claimCandidate('c1')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/przypisane/)
    })

    it('rejects when candidate is not in "kandydat" status', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { candidates: [{ id: 'c1', user_id: null, candidate_status: 'archived' }] },
        })
        const { claimCandidate } = await import('../matching')
        const result = await claimCandidate('c1')
        expect(result.success).toBe(false)
    })

    it('rejects when user already has another candidate claimed', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                candidates: [
                    { id: 'c1', user_id: null, candidate_status: 'kandydat' },
                    { id: 'c-existing', user_id: 'u1', candidate_status: 'konsultant' },
                ],
            },
        })
        const { claimCandidate } = await import('../matching')
        const result = await claimCandidate('c1')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/przypisane CV/i)
    })

    it('on success: sets user_id, claimed_by, candidate_status="konsultant", merges fields into profile', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                profiles: [{ id: 'u1', onboarding_completed: false }],
                candidates: [{ id: 'c1', user_id: null, candidate_status: 'kandydat', bio: 'Senior React dev', skills: ['React'], cv_url: '/cv.pdf', avatar_url: null, experience_years: 7, previous_clients: ['Klient'] }],
            },
        })
        const { claimCandidate } = await import('../matching')
        const result = await claimCandidate('c1')
        expect(result).toEqual({ success: true })
        const candidate = currentClient._tables.candidates[0]
        expect(candidate.user_id).toBe('u1')
        expect(candidate.claimed_by).toBe('u1')
        expect(candidate.candidate_status).toBe('konsultant')
        const profile = currentClient._tables.profiles[0]
        expect(profile.bio).toBe('Senior React dev')
        expect(profile.skills).toEqual(['React'])
        expect(profile.cv_url).toBe('/cv.pdf')
        expect(profile.experience_years).toBe(7)
        expect(profile.onboarding_completed).toBe(true)
    })
})
