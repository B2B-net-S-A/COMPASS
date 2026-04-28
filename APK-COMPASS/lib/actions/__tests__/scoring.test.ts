import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messagesCreate, resetAnthropicMock, setAnthropicJSONResponse, setAnthropicMock, setAnthropicTextResponse } from '@/test/mocks/anthropic'
import { batchScore, type ScoringResult } from '../scoring'

const sampleItems = [
    { id: 'item-1', content: 'React + TypeScript senior, 8y exp' },
    { id: 'item-2', content: 'Java backend, 3y exp' },
]

beforeEach(() => {
    resetAnthropicMock()
    messagesCreate.mockClear()
})

describe('batchScore', () => {
    it('returns empty array immediately when items is empty (no LLM call)', async () => {
        const out = await batchScore([], 'q', 'candidate-to-projects')
        expect(out).toEqual([])
        expect(messagesCreate).not.toHaveBeenCalled()
    })

    it('parses standard {"results":[...]} response shape', async () => {
        const expected: ScoringResult[] = [
            { id: 'item-1', combined_score: 92, quality_band: 'EXCELLENT', recommendation: 'SUBMIT', reasoning: 'Match' },
            { id: 'item-2', combined_score: 30, quality_band: 'WEAK', recommendation: 'REJECT', reasoning: 'Mismatch' },
        ]
        setAnthropicJSONResponse({ results: expected })
        const out = await batchScore(sampleItems, 'React project', 'candidate-to-projects')
        expect(out).toEqual(expected)
    })

    it('parses {"matches":[...]} alternate key', async () => {
        const expected: ScoringResult[] = [
            { id: 'a', combined_score: 50, quality_band: 'ACCEPTABLE', recommendation: 'REVIEW', reasoning: 'maybe' },
        ]
        setAnthropicJSONResponse({ matches: expected })
        const out = await batchScore([{ id: 'a', content: 'x' }], 'q', 'project-to-candidates')
        expect(out).toEqual(expected)
    })

    it('parses a bare top-level JSON array', async () => {
        const expected: ScoringResult[] = [
            { id: 'a', combined_score: 70, quality_band: 'GOOD', recommendation: 'SUBMIT', reasoning: 'ok' },
        ]
        setAnthropicTextResponse(JSON.stringify(expected))
        const out = await batchScore([{ id: 'a', content: 'x' }], 'q', 'project-to-candidates')
        expect(out).toEqual(expected)
    })

    it('parses a JSON object with an arbitrary array-valued key (fallback heuristic)', async () => {
        const expected: ScoringResult[] = [
            { id: 'a', combined_score: 60, quality_band: 'ACCEPTABLE', recommendation: 'REVIEW', reasoning: 'meh' },
        ]
        setAnthropicJSONResponse({ scoring_output: expected })
        const out = await batchScore([{ id: 'a', content: 'x' }], 'q', 'project-to-candidates')
        expect(out).toEqual(expected)
    })

    it('returns [] (does not throw) when LLM throws', async () => {
        setAnthropicMock(() => { throw new Error('rate limited') })
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const out = await batchScore(sampleItems, 'q', 'candidate-to-projects')
        expect(out).toEqual([])
        expect(err).toHaveBeenCalledWith('Batch scoring failed:', expect.any(Error))
        err.mockRestore()
    })

    it('returns [] when LLM produces unrecognized shape', async () => {
        setAnthropicJSONResponse({ unrelated: 'value' })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const out = await batchScore(sampleItems, 'q', 'candidate-to-projects')
        expect(out).toEqual([])
        warn.mockRestore()
    })

    it('embeds the query content + items into the prompt sent to the LLM', async () => {
        setAnthropicJSONResponse({ results: [] })
        await batchScore(sampleItems, 'PROJECT XYZ', 'candidate-to-projects')
        const args = messagesCreate.mock.calls[0][0] as { messages: Array<{ content: string }> }
        const prompt = args.messages[0].content
        expect(prompt).toContain('KANDYDAT: PROJECT XYZ')
        expect(prompt).toContain('item-1')
        expect(prompt).toContain('item-2')
        expect(prompt).toMatch(/Hard Reject/i)
        expect(prompt).toMatch(/Konserwatywnie/i)
    })

    it('uses "PROJEKT" prefix for project-to-candidates mode', async () => {
        setAnthropicJSONResponse({ results: [] })
        await batchScore(sampleItems, 'CANDIDATE ABC', 'project-to-candidates')
        const args = messagesCreate.mock.calls[0][0] as { messages: Array<{ content: string }> }
        expect(args.messages[0].content).toContain('PROJEKT: CANDIDATE ABC')
    })

    it('routes to Haiku (fast) model — gpt-4o-mini → claude-haiku-4-5', async () => {
        setAnthropicJSONResponse({ results: [] })
        await batchScore(sampleItems, 'q', 'candidate-to-projects')
        const args = messagesCreate.mock.calls[0][0] as { model: string }
        expect(args.model).toBe('claude-haiku-4-5')
    })
})
