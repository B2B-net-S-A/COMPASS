import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { messagesCreate, resetAnthropicMock, setAnthropicJSONResponse, setAnthropicMock, setAnthropicTextResponse } from '@/test/mocks/anthropic'
import { chatJSON, chatText, fromOpenAIMessages } from '../llm'

describe('chatText', () => {
    beforeEach(() => {
        resetAnthropicMock()
        messagesCreate.mockClear()
    })

    it('returns the text content from the first text block', async () => {
        setAnthropicTextResponse('Hello world')
        const out = await chatText({ messages: [{ role: 'user', content: 'hi' }] })
        expect(out).toBe('Hello world')
    })

    it('passes system + messages + max_tokens defaults to the SDK', async () => {
        setAnthropicTextResponse('ok')
        await chatText({
            system: 'you are a bot',
            messages: [
                { role: 'user', content: 'q1' },
                { role: 'assistant', content: 'a1' },
                { role: 'user', content: 'q2' },
            ],
        })
        expect(messagesCreate).toHaveBeenCalledTimes(1)
        const args = messagesCreate.mock.calls[0][0] as Record<string, unknown>
        expect(args.system).toBe('you are a bot')
        expect(args.max_tokens).toBe(4096)
        expect(args.messages).toEqual([
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: 'a1' },
            { role: 'user', content: 'q2' },
        ])
    })

    it('passes through custom max_tokens and temperature', async () => {
        setAnthropicTextResponse('ok')
        await chatText({ messages: [{ role: 'user', content: 'x' }], maxTokens: 256, temperature: 0.7 })
        const args = messagesCreate.mock.calls[0][0] as Record<string, unknown>
        expect(args.max_tokens).toBe(256)
        expect(args.temperature).toBe(0.7)
    })

    it('returns empty string when SDK responds with non-text block only', async () => {
        setAnthropicMock(() => ({ content: [{ type: 'tool_use', text: '' as never }] }))
        const out = await chatText({ messages: [{ role: 'user', content: 'hi' }] })
        expect(out).toBe('')
    })

    it('propagates SDK errors', async () => {
        setAnthropicMock(() => { throw new Error('rate limited') })
        await expect(chatText({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('rate limited')
    })
})

describe('model mapping (legacy OpenAI names → Claude)', () => {
    beforeEach(() => {
        resetAnthropicMock()
        messagesCreate.mockClear()
    })

    it('maps gpt-4o-mini → claude-haiku-4-5', async () => {
        setAnthropicTextResponse('ok')
        await chatText({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x' }] })
        expect((messagesCreate.mock.calls[0][0] as any).model).toBe('claude-haiku-4-5')
    })

    it('maps gpt-4o → claude-sonnet-4-5', async () => {
        setAnthropicTextResponse('ok')
        await chatText({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }] })
        expect((messagesCreate.mock.calls[0][0] as any).model).toBe('claude-sonnet-4-5')
    })

    it('keeps native claude model names verbatim', async () => {
        setAnthropicTextResponse('ok')
        await chatText({ model: 'claude-opus-4-5', messages: [{ role: 'user', content: 'x' }] })
        expect((messagesCreate.mock.calls[0][0] as any).model).toBe('claude-opus-4-5')
    })

    it('maps gpt-4o-nano (or any *nano*/*haiku*) → fast model', async () => {
        setAnthropicTextResponse('ok')
        await chatText({ model: 'something-nano', messages: [{ role: 'user', content: 'x' }] })
        expect((messagesCreate.mock.calls[0][0] as any).model).toBe('claude-haiku-4-5')
    })

    it('falls back to default model when no model name passed', async () => {
        setAnthropicTextResponse('ok')
        await chatText({ messages: [{ role: 'user', content: 'x' }] })
        expect((messagesCreate.mock.calls[0][0] as any).model).toBe('claude-haiku-4-5')
    })
})

describe('chatJSON', () => {
    beforeEach(() => {
        resetAnthropicMock()
        messagesCreate.mockClear()
    })

    it('parses a clean JSON object response', async () => {
        setAnthropicJSONResponse({ a: 1, b: 'x' })
        const out = await chatJSON<{ a: number; b: string }>({ messages: [{ role: 'user', content: 'q' }] })
        expect(out).toEqual({ a: 1, b: 'x' })
    })

    it('strips ```json fences', async () => {
        setAnthropicTextResponse('```json\n{"a": 1}\n```')
        const out = await chatJSON({ messages: [{ role: 'user', content: 'q' }] })
        expect(out).toEqual({ a: 1 })
    })

    it('strips bare ``` fences', async () => {
        setAnthropicTextResponse('```\n{"a": 2}\n```')
        const out = await chatJSON({ messages: [{ role: 'user', content: 'q' }] })
        expect(out).toEqual({ a: 2 })
    })

    it('extracts the first JSON object substring on dirty output', async () => {
        setAnthropicTextResponse('Here is your answer: {"a": 3} hope this helps')
        const out = await chatJSON({ messages: [{ role: 'user', content: 'q' }] })
        expect(out).toEqual({ a: 3 })
    })

    it('throws on un-parseable garbage', async () => {
        setAnthropicTextResponse('not json at all here we are')
        await expect(chatJSON({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(/did not return valid JSON/i)
    })

    it('appends JSON instruction to the system prompt', async () => {
        setAnthropicJSONResponse({ ok: true })
        await chatJSON({ system: 'Be terse.', messages: [{ role: 'user', content: 'x' }] })
        const args = messagesCreate.mock.calls[0][0] as { system?: string }
        expect(args.system).toContain('Be terse.')
        expect(args.system).toMatch(/Respond ONLY with valid JSON/)
    })
})

describe('fromOpenAIMessages', () => {
    it('extracts a system message and keeps user/assistant turns in order', () => {
        const result = fromOpenAIMessages([
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: 'a1' },
        ])
        expect(result.system).toBe('sys')
        expect(result.messages).toEqual([
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: 'a1' },
        ])
    })

    it('returns undefined system when no system message present', () => {
        const result = fromOpenAIMessages([{ role: 'user', content: 'q' }])
        expect(result.system).toBeUndefined()
    })

    it('drops unknown roles (e.g. tool/function)', () => {
        const result = fromOpenAIMessages([
            { role: 'system', content: 's' },
            { role: 'user', content: 'q' },
            { role: 'tool', content: 't' },
        ])
        expect(result.messages).toEqual([{ role: 'user', content: 'q' }])
    })
})
