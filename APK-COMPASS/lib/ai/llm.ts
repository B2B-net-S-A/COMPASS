/**
 * Universal LLM wrapper — Anthropic Claude for chat completions.
 * Compatible drop-in for previous OpenAI chat.completions usage.
 *
 * Migration note: OpenAI chat.completions.create({...}) → chatJSON / chatText
 *
 * Models:
 * - claude-haiku-4-5    — szybki, tani, do batch i prostych ekstrakcji (gpt-4o-mini equiv)
 * - claude-sonnet-4-5   — głębsze rozumowanie (gpt-4o equiv)
 *
 * Embeddings: NIE NA KIEYS Anthropic — używaj Voyage AI z lib/ai/embeddings.ts.
 */

import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null
function getClient(): Anthropic {
    if (_client) return _client
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY env var is required for AI features')
    }
    _client = new Anthropic({ apiKey })
    return _client
}

export type LLMRole = 'user' | 'assistant'
export interface LLMMessage {
    role: LLMRole
    content: string
}

export interface ChatOptions {
    model?: string
    system?: string
    messages: LLMMessage[]
    maxTokens?: number
    temperature?: number
}

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'
const FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL ?? 'claude-haiku-4-5'
const STRONG_MODEL = process.env.ANTHROPIC_STRONG_MODEL ?? 'claude-sonnet-4-5'

/**
 * Map legacy OpenAI model names to Claude equivalents.
 */
function mapModel(model?: string): string {
    if (!model) return DEFAULT_MODEL
    const lower = model.toLowerCase()
    if (lower.includes('claude')) return model
    if (lower.includes('mini') || lower.includes('nano') || lower.includes('haiku')) return FAST_MODEL
    if (lower.includes('o') || lower.includes('sonnet') || lower.includes('opus')) return STRONG_MODEL
    return DEFAULT_MODEL
}

/**
 * Chat completion returning plain text.
 */
export async function chatText(opts: ChatOptions): Promise<string> {
    const client = getClient()
    const res = await client.messages.create({
        model: mapModel(opts.model),
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature,
        system: opts.system,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    })
    const block = res.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
}

/**
 * Chat completion expecting JSON output. Auto-prepends JSON instruction to system prompt.
 * Returns parsed object. Throws on parse failure.
 */
export async function chatJSON<T = unknown>(opts: ChatOptions): Promise<T> {
    const sysWithJson = (opts.system ? opts.system + '\n\n' : '')
        + 'Respond ONLY with valid JSON, no markdown code fences, no explanations. Output must be a single JSON object.'
    const text = await chatText({ ...opts, system: sysWithJson })
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    try {
        return JSON.parse(cleaned) as T
    } catch (e) {
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
            return JSON.parse(match[0]) as T
        }
        throw new Error(`LLM did not return valid JSON: ${cleaned.slice(0, 200)}`)
    }
}

/**
 * Convert legacy OpenAI-style messages (system + user/assistant) to Claude format.
 */
export function fromOpenAIMessages(messages: Array<{ role: string; content: string }>): { system?: string; messages: LLMMessage[] } {
    const system = messages.find((m) => m.role === 'system')?.content
    const filtered: LLMMessage[] = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as LLMRole, content: m.content }))
    return { system, messages: filtered }
}
