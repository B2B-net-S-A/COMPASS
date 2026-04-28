import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

function setupClient(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('getCandidateMatchSummary', () => {
    it('returns zeros when candidate has no embedding', async () => {
        setupClient({
            tables: { candidates: [{ id: 'c1', embedding: null }] },
        })
        const { getCandidateMatchSummary } = await import('../candidates')
        const result = await getCandidateMatchSummary('c1')
        expect(result).toEqual({ total: 0, high: 0, medium: 0, low: 0 })
    })

    it('returns zeros when match RPC errors', async () => {
        setupClient({
            tables: { candidates: [{ id: 'c1', embedding: [0.1, 0.2] }] },
        })
        const { getCandidateMatchSummary } = await import('../candidates')
        const result = await getCandidateMatchSummary('c1')
        expect(result).toEqual({ total: 0, high: 0, medium: 0, low: 0 })
    })

    it('counts matches across high/medium/low tiers (cumulative thresholds)', async () => {
        setupClient({
            tables: { candidates: [{ id: 'c1', embedding: [0.1, 0.2] }] },
            rpcs: {
                match_projects: () => [
                    { id: 'p1', similarity: 0.95 },  // high + medium + low
                    { id: 'p2', similarity: 0.75 },  // medium + low
                    { id: 'p3', similarity: 0.55 },  // low
                    { id: 'p4', similarity: 0.40 },  // none (below 0.5)
                ],
            },
        })
        const { getCandidateMatchSummary } = await import('../candidates')
        const result = await getCandidateMatchSummary('c1')
        expect(result.total).toBe(4)
        expect(result.high).toBe(1)
        expect(result.medium).toBe(2)
        expect(result.low).toBe(3)
    })
})

describe('getMatchingProjectsForCandidate', () => {
    it('returns [] when candidate not found', async () => {
        setupClient({ tables: { candidates: [] } })
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { getMatchingProjectsForCandidate } = await import('../candidates')
        const result = await getMatchingProjectsForCandidate('c-missing')
        expect(result).toEqual([])
        err.mockRestore()
    })

    it('returns [] when candidate has no embedding (logs warning)', async () => {
        setupClient({
            tables: { candidates: [{ id: 'c1', full_name: 'A', bio: 'b', skills: [], embedding: null }] },
        })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { getMatchingProjectsForCandidate } = await import('../candidates')
        const result = await getMatchingProjectsForCandidate('c1')
        expect(result).toEqual([])
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    it('merges cached AI scores from match_results when present (score divided by 100)', async () => {
        setupClient({
            tables: {
                candidates: [{ id: 'c1', full_name: 'A', bio: 'b', skills: [], embedding: [0.1, 0.2] }],
                match_results: [
                    { candidate_id: 'c1', project_id: 'p1', score: 90, recommendation: 'SUBMIT', reasoning: 'good' },
                ],
            },
            rpcs: {
                match_projects: () => [
                    { id: 'p1', title: 'P1', similarity: 0.5, description: '', required_skills: [] },
                    { id: 'p2', title: 'P2', similarity: 0.6, description: '', required_skills: [] },
                ],
            },
        })
        const { getMatchingProjectsForCandidate } = await import('../candidates')
        const result = await getMatchingProjectsForCandidate('c1')
        const p1 = result.find(p => p.id === 'p1')!
        const p2 = result.find(p => p.id === 'p2')!
        expect(p1.similarity).toBe(0.9)
        expect(p1.ai_recommendation).toBe('SUBMIT')
        expect(p1.ai_reasoning).toBe('good')
        expect(p2.similarity).toBe(0.6)
    })

    it('sorts results by similarity desc', async () => {
        setupClient({
            tables: {
                candidates: [{ id: 'c1', full_name: 'A', bio: 'b', skills: [], embedding: [0.1] }],
                match_results: [],
            },
            rpcs: {
                match_projects: () => [
                    { id: 'p1', title: 'P1', similarity: 0.5, description: '', required_skills: [] },
                    { id: 'p2', title: 'P2', similarity: 0.9, description: '', required_skills: [] },
                    { id: 'p3', title: 'P3', similarity: 0.7, description: '', required_skills: [] },
                ],
            },
        })
        const { getMatchingProjectsForCandidate } = await import('../candidates')
        const result = await getMatchingProjectsForCandidate('c1')
        expect(result.map(r => r.id)).toEqual(['p2', 'p3', 'p1'])
    })
})

describe('deleteCandidate', () => {
    it('deletes the candidate row by id', async () => {
        setupClient({
            tables: { candidates: [{ id: 'c1' }, { id: 'c2' }] },
        })
        const { deleteCandidate } = await import('../candidates')
        const result = await deleteCandidate('c1')
        expect(result).toEqual({ success: true })
        expect(currentClient._tables.candidates.map(c => c.id)).toEqual(['c2'])
    })
})

describe('deleteCandidates (bulk)', () => {
    it('deletes multiple candidates by id list', async () => {
        setupClient({
            tables: { candidates: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] },
        })
        const { deleteCandidates } = await import('../candidates')
        const result = await deleteCandidates(['c1', 'c3'])
        expect(result).toEqual({ success: true })
        expect(currentClient._tables.candidates.map(c => c.id)).toEqual(['c2'])
    })
})
