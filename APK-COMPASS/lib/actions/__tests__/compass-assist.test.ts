import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'
import { setAnthropicTextResponse, resetAnthropicMock, messagesCreate } from '@/test/mocks/anthropic'
import { deterministicEmbedding } from '@/test/mocks/voyage'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('@/lib/ai/embeddings', () => ({
    generateEmbedding: vi.fn(async (text: string) => deterministicEmbedding(text)),
}))

vi.mock('../knowledge-base', () => ({
    searchKnowledge: vi.fn(async () => [
        { id: 'k1', category: 'benefits', content: 'Multisport entitled after 3 months', similarity: 0.9 },
    ]),
}))

vi.mock('../centrala', () => ({
    getCentralaData: vi.fn(async () => ({
        benefits: [{ id: 'b1', name: 'Multisport' }],
        invoices: [],
    })),
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    resetAnthropicMock()
    vi.clearAllMocks()
})

describe('getConsultantContext', () => {
    it('aggregates profile + centralaData + assignments into one object', async () => {
        setup({
            tables: {
                profiles: [{ id: 'u1', full_name: 'Jan', candidates: { id: 'c1' } }],
                match_results: [
                    { candidate_id: 'c1', recommendation: 'SUBMIT', projects: { id: 'p1', title: 'Project A' } },
                ],
            },
        })
        const { getConsultantContext } = await import('../compass-assist')
        const result = await getConsultantContext('u1')
        expect(result.profile).toBeDefined()
        expect(result.centralaData.benefits).toBeDefined()
        expect(Array.isArray(result.assignments)).toBe(true)
    })
})

describe('processChat (RAG flow)', () => {
    it('calls LLM with system prompt that includes consultant context + RAG knowledge', async () => {
        setAnthropicTextResponse('Multisport jest dostępny po 3 miesiącach.')
        setup({
            tables: {
                profiles: [{ id: 'u1', full_name: 'Jan', candidates: { id: 'c1' } }],
                match_results: [],
            },
        })
        const { processChat } = await import('../compass-assist')
        const response = await processChat('u1', 'Kiedy mogę dostać Multisport?') as { content: string; relatedKnowledge: string[] }
        expect(typeof response.content).toBe('string')
        expect(response.content).toMatch(/Multisport/)
        expect(response.relatedKnowledge).toEqual(['k1'])

        const args = messagesCreate.mock.calls[0][0] as { system?: string; messages: Array<{ content: string }> }
        // System prompt should mention Compass Assist + B2B.net + RAG knowledge
        expect(args.system).toMatch(/Compass Assist/)
        expect(args.system).toMatch(/Multisport entitled after 3 months/)
        // User message is at the end
        expect(args.messages[args.messages.length - 1].content).toBe('Kiedy mogę dostać Multisport?')
    })

    it('respects conversation history (filters out system messages)', async () => {
        setAnthropicTextResponse('OK')
        setup({
            tables: {
                profiles: [{ id: 'u1', full_name: 'Jan', candidates: { id: 'c1' } }],
                match_results: [],
            },
        })
        const { processChat } = await import('../compass-assist')
        await processChat('u1', 'next question', [
            { role: 'system', content: 'should be filtered' },
            { role: 'user', content: 'previous user q' },
            { role: 'assistant', content: 'previous AI response' },
        ])
        const args = messagesCreate.mock.calls[0][0] as { messages: Array<{ role: string }> }
        // Only user + assistant turns, no system in messages
        expect(args.messages.every((m: { role: string }) => m.role !== 'system')).toBe(true)
        // 3 messages total: prev user + prev assistant + current user
        expect(args.messages).toHaveLength(3)
    })
})
