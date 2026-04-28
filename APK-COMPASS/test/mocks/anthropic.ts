import { vi } from 'vitest'

type AnthropicResponse = {
    content: Array<{ type: string; text: string }>
}

export type AnthropicMockHandler = (input: {
    model: string
    system?: string
    messages: Array<{ role: string; content: string }>
    max_tokens?: number
    temperature?: number
}) => AnthropicResponse | Promise<AnthropicResponse>

let mockHandler: AnthropicMockHandler = () => ({
    content: [{ type: 'text', text: '{}' }],
})

export function setAnthropicMock(handler: AnthropicMockHandler): void {
    mockHandler = handler
}

export function setAnthropicTextResponse(text: string): void {
    mockHandler = () => ({ content: [{ type: 'text', text }] })
}

export function setAnthropicJSONResponse(obj: unknown): void {
    mockHandler = () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] })
}

export function resetAnthropicMock(): void {
    mockHandler = () => ({ content: [{ type: 'text', text: '{}' }] })
    messagesCreate.mockClear()
}

export const messagesCreate = vi.fn(async (input: Parameters<AnthropicMockHandler>[0]) => {
    return mockHandler(input)
})
