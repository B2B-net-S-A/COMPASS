import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'
import { setAnthropicJSONResponse, resetAnthropicMock } from '@/test/mocks/anthropic'
import { deterministicEmbedding } from '@/test/mocks/voyage'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('@/lib/ai/embeddings', () => ({
    generateEmbedding: vi.fn(async (text: string) => deterministicEmbedding(text)),
}))

vi.mock('@/lib/files/parsers', () => ({
    parseFile: vi.fn(async (file: File) => `parsed text from ${file.name}`),
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    resetAnthropicMock()
    vi.clearAllMocks()
})

describe('analyzeGap', () => {
    it('throws when not authenticated', async () => {
        setup({ user: null })
        const { analyzeGap } = await import('../admin')
        await expect(analyzeGap('p1')).rejects.toThrow('Not authenticated')
    })

    it('returns error message when user has no bio', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', bio: null }] },
        })
        const { analyzeGap } = await import('../admin')
        const result = await analyzeGap('p1')
        expect((result as { error: string }).error).toMatch(/Bio/i)
    })

    it('throws when project not found', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', bio: 'React senior 8y' }],
                projects: [],
            },
        })
        const { analyzeGap } = await import('../admin')
        await expect(analyzeGap('p-missing')).rejects.toThrow('Project not found')
    })

    it('returns parsed AI analysis on happy path', async () => {
        setAnthropicJSONResponse({
            match_score: 85,
            matching_skills: ['React', 'TS'],
            missing_skills: ['Vue'],
            explanation: 'Good fit',
        })
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', bio: 'React 8y' }],
                projects: [{ id: 'p1', title: 'React Senior', description: 'work', required_skills: ['React', 'TS', 'Vue'] }],
            },
        })
        const { analyzeGap } = await import('../admin')
        const result = await analyzeGap('p1') as Record<string, unknown>
        expect(result.match_score).toBe(85)
        expect(result.missing_skills).toEqual(['Vue'])
    })

    it('returns error object (not throws) when LLM fails', async () => {
        const { setAnthropicMock } = await import('@/test/mocks/anthropic')
        setAnthropicMock(() => { throw new Error('rate limited') })
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                profiles: [{ id: 'u1', bio: 'React' }],
                projects: [{ id: 'p1', title: 'X', description: 'y', required_skills: [] }],
            },
        })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { analyzeGap } = await import('../admin')
        const result = await analyzeGap('p1')
        expect((result as { error: string }).error).toMatch(/luki/i)
        errorSpy.mockRestore()
    })
})

describe('parseProjectSpec', () => {
    it('throws when no file in formData', async () => {
        setup({})
        const fd = new FormData()
        const { parseProjectSpec } = await import('../admin')
        await expect(parseProjectSpec(fd)).rejects.toThrow('No file')
    })

    it('parses file → calls LLM → returns structured project data', async () => {
        setAnthropicJSONResponse({
            title: 'Senior React',
            description: 'Migration project',
            required_skills: ['React', 'Next.js'],
            budget_range: '150-200 PLN/h',
        })
        setup({})
        const fd = new FormData()
        fd.set('file', new File(['spec text'], 'spec.pdf', { type: 'application/pdf' }))
        const { parseProjectSpec } = await import('../admin')
        const result = await parseProjectSpec(fd) as Record<string, unknown>
        expect(result.title).toBe('Senior React')
        expect(result.required_skills).toEqual(['React', 'Next.js'])
    })

    it('throws "Failed to parse project spec" when LLM rejects', async () => {
        const { setAnthropicMock } = await import('@/test/mocks/anthropic')
        setAnthropicMock(() => { throw new Error('LLM down') })
        setup({})
        const fd = new FormData()
        fd.set('file', new File(['x'], 'x.pdf', { type: 'application/pdf' }))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { parseProjectSpec } = await import('../admin')
        await expect(parseProjectSpec(fd)).rejects.toThrow('Failed to parse project spec')
        errorSpy.mockRestore()
    })
})

describe('createProjectFromSpec', () => {
    it('inserts project with generated embedding', async () => {
        setup({ tables: { projects: [] } })
        const { createProjectFromSpec } = await import('../admin')
        await createProjectFromSpec({
            title: 'React Senior',
            description: 'work',
            required_skills: ['React'],
            budget_range: '100',
        })
        const row = currentClient._tables.projects[0]
        expect(row.title).toBe('React Senior')
        expect(row.required_skills).toEqual(['React'])
        // embedding kolumna vector(1536) — typy Supabase generują jako string | null
        // (pgvector deserializuje "[1,2,3]"). createProjectFromSpec robi JSON.stringify(number[]).
        expect(typeof row.embedding).toBe('string')
        expect(JSON.parse(row.embedding as string)).toEqual(expect.any(Array))
    })
})
