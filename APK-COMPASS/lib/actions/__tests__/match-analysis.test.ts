import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'
import { setAnthropicJSONResponse, resetAnthropicMock } from '@/test/mocks/anthropic'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    resetAnthropicMock()
    vi.clearAllMocks()
})

describe('analyzeMatch', () => {
    const fakeProject = {
        id: 'p1', title: 'React Senior', position: 'Senior FE', description: 'work',
        required_skills: ['React', 'TS'], location: 'Warsaw', work_type: 'B2B', max_rate: 200,
    }
    const fakeCandidate = {
        id: 'c1', full_name: 'Jan', bio: 'dev', skills: ['React', 'TS'],
        location: 'Warsaw', current_status: 'active',
    }
    const fakeAnalysisResponse = {
        strong_points: ['React 8y', 'TS expert'],
        missing_requirements: ['Vue.js'],
        recommendation: 'SUBMIT',
        match_score_verification: 92,
        summary: 'Bardzo dobry kandydat.',
        negotiation_points: ['stawka'],
        confidence: 'high',
    }

    it('throws when project not found', async () => {
        setup({ tables: { projects: [], candidates: [fakeCandidate] } })
        const { analyzeMatch } = await import('../match-analysis')
        await expect(analyzeMatch('p-missing', 'c1')).rejects.toThrow('Project not found')
    })

    it('throws when both candidate and profile lookups fail', async () => {
        setup({ tables: { projects: [fakeProject], candidates: [], profiles: [] } })
        const { analyzeMatch } = await import('../match-analysis')
        await expect(analyzeMatch('p1', 'c-missing')).rejects.toThrow(/Candidate.*not found/i)
    })

    it('returns parsed AnalysisResult shape from LLM response', async () => {
        setAnthropicJSONResponse(fakeAnalysisResponse)
        setup({
            tables: {
                projects: [fakeProject],
                candidates: [fakeCandidate],
                match_results: [],
            },
        })
        const { analyzeMatch } = await import('../match-analysis')
        const result = await analyzeMatch('p1', 'c1')
        expect(result.strong_points).toEqual(['React 8y', 'TS expert'])
        expect(result.recommendation).toBe('SUBMIT')
        expect(result.match_score_verification).toBe(92)
        expect(result.confidence).toBe('high')
    })

    it('falls back to default values when LLM omits fields', async () => {
        setAnthropicJSONResponse({})
        setup({
            tables: { projects: [fakeProject], candidates: [fakeCandidate], match_results: [] },
        })
        const { analyzeMatch } = await import('../match-analysis')
        const result = await analyzeMatch('p1', 'c1')
        expect(result.recommendation).toBe('REVIEW')
        expect(result.match_score_verification).toBe(0)
        expect(result.confidence).toBe('medium')
        expect(result.strong_points).toEqual([])
        expect(result.summary).toMatch(/Brak/)
    })

    it('falls back to profiles table when candidate row is missing', async () => {
        setAnthropicJSONResponse(fakeAnalysisResponse)
        setup({
            tables: {
                projects: [fakeProject],
                candidates: [],
                profiles: [{ id: 'c1', full_name: 'Jan from profiles', bio: 'b', skills: ['React'], location: 'WAW', status: 'Active' }],
                match_results: [],
            },
        })
        const { analyzeMatch } = await import('../match-analysis')
        const result = await analyzeMatch('p1', 'c1')
        expect(result.recommendation).toBe('SUBMIT')
    })

    it('persists Stage 3 result to match_results upsert', async () => {
        setAnthropicJSONResponse(fakeAnalysisResponse)
        setup({
            tables: {
                projects: [fakeProject],
                candidates: [fakeCandidate],
                match_results: [],
            },
        })
        const { analyzeMatch } = await import('../match-analysis')
        await analyzeMatch('p1', 'c1')
        const persisted = currentClient._tables.match_results
        expect(persisted).toHaveLength(1)
        expect(persisted[0].project_id).toBe('p1')
        expect(persisted[0].candidate_id).toBe('c1')
        expect(persisted[0].score).toBe(92)
        expect(persisted[0].recommendation).toBe('SUBMIT')
    })
})
