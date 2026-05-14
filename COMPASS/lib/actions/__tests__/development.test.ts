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

describe('getSkillGaps', () => {
    it('returns "Niezalogowany" diagnostics when user is null', async () => {
        setup({ user: null })
        const { getSkillGaps } = await import('../development')
        const result = await getSkillGaps()
        expect(result.totalAnalyzed).toBe(0)
        expect(result.gaps).toEqual([])
        expect(result.diagnostics).toBe('Niezalogowany')
    })

    it('returns 0 totals when consultant has no skills (and is not admin)', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', skills: [], bio: null, embedding: null, role: 'consultant' }],
                projects: [],
            },
        })
        const { getSkillGaps } = await import('../development')
        const result = await getSkillGaps()
        expect(result.totalAnalyzed).toBe(0)
        expect(result.userSkillsCount).toBe(0)
        // diagnostics should explain the empty result
        expect(result.diagnostics).toMatch(/Brak umiejętności|umiejętności/i)
    })

    it('returns perfect_match for project where all required skills are in user skills', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', skills: ['React', 'TypeScript', 'Next.js'], bio: 'dev', embedding: null, role: 'consultant' }],
                projects: [
                    { id: 'p1', title: 'Frontend Project', required_skills: ['react', 'typescript'], created_at: '2026-04-01' },
                ],
            },
        })
        const { getSkillGaps } = await import('../development')
        const result = await getSkillGaps()
        expect(result.gaps).toHaveLength(1)
        expect(result.gaps[0].status).toBe('perfect_match')
        expect(result.perfectMatches).toBe(1)
        expect(result.gaps[0].missingSkills).toEqual([])
    })

    it('returns has_gaps with missingSkills for partial match', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', skills: ['React'], bio: 'dev', embedding: null, role: 'consultant' }],
                projects: [
                    { id: 'p1', title: 'Full-stack Project', required_skills: ['React', 'PostgreSQL', 'Docker'], created_at: '2026-04-01' },
                ],
            },
        })
        const { getSkillGaps } = await import('../development')
        const result = await getSkillGaps()
        expect(result.gaps[0].status).toBe('has_gaps')
        expect(result.gaps[0].missingSkills.sort()).toEqual(['Docker', 'PostgreSQL'])
        expect(result.gaps[0].matchedSkills).toEqual(['React'])
    })

    it('normalizes skill aliases (reactjs ⇔ react, k8s ⇔ kubernetes)', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', skills: ['ReactJS', 'k8s'], bio: 'dev', embedding: null, role: 'consultant' }],
                projects: [
                    { id: 'p1', title: 'Cloud project', required_skills: ['react', 'kubernetes'], created_at: '2026-04-01' },
                ],
            },
        })
        const { getSkillGaps } = await import('../development')
        const result = await getSkillGaps()
        expect(result.gaps[0].status).toBe('perfect_match')
    })

    it('treats no_requirements (empty required_skills) as a non-gap', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', skills: ['React'], bio: 'dev', embedding: null, role: 'consultant' }],
                projects: [
                    { id: 'p1', title: 'No requirements', required_skills: [], created_at: '2026-04-01' },
                ],
            },
        })
        const { getSkillGaps } = await import('../development')
        const result = await getSkillGaps()
        expect(result.gaps[0].status).toBe('no_requirements')
        expect(result.perfectMatches).toBe(1)
    })
})
