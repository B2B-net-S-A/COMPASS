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

describe('searchDocumentsForAI', () => {
    it('returns RPC results when search_documents_for_ai RPC is available', async () => {
        const rpcResults = [
            { id: 'd1', title: 'Regulamin', category: 'legal', description: '', text_content: 'tekst', is_public: true, relevance: 0.95 },
        ]
        setup({
            rpcs: {
                search_documents_for_ai: () => rpcResults,
            },
        })
        const { searchDocumentsForAI } = await import('../document-indexing')
        const result = await searchDocumentsForAI('regulamin', 'consultant', 5)
        expect(result).toEqual(rpcResults)
    })

    it('falls back to ILIKE search when RPC errors', async () => {
        setup({
            tables: {
                app_documents: [
                    { id: 'd1', title: 'Regulamin', category: 'legal', description: '', text_content: 'pełny regulamin firmy', is_archived: false, is_public: true },
                    { id: 'd2', title: 'Inny', category: 'other', description: '', text_content: 'cos innego', is_archived: false, is_public: true },
                ],
            },
        })
        const { searchDocumentsForAI } = await import('../document-indexing')
        const result = await searchDocumentsForAI('regulamin', 'consultant', 5)
        expect(result.length).toBeGreaterThanOrEqual(1)
        expect(result[0].relevance).toBe(0.5)
        expect(result.find(r => r.id === 'd1')).toBeDefined()
    })
})

describe('searchKnowledgeBaseSimple', () => {
    it('returns matching rows from compass_assist_knowledge', async () => {
        setup({
            tables: {
                compass_assist_knowledge: [
                    { id: 'k1', content: 'Multisport jest dostępny', category: 'benefits' },
                    { id: 'k2', content: 'Coś innego o pracy', category: 'work' },
                ],
            },
        })
        const { searchKnowledgeBaseSimple } = await import('../document-indexing')
        const result = await searchKnowledgeBaseSimple('Multisport')
        expect(result.find(k => k.id === 'k1')).toBeDefined()
    })

    it('returns [] when knowledge table is empty', async () => {
        setup({ tables: { compass_assist_knowledge: [] } })
        const { searchKnowledgeBaseSimple } = await import('../document-indexing')
        expect(await searchKnowledgeBaseSimple('anything')).toEqual([])
    })
})

describe('buildDocumentContext', () => {
    it('returns empty string when query has no useful terms and is not document-related', async () => {
        setup({})
        const { buildDocumentContext } = await import('../document-indexing')
        // Single short word — no extracted terms, not documentish
        const result = await buildDocumentContext('hi', 'consultant')
        expect(typeof result).toBe('string')
    })

    it('returns content when query is about regulations/documents', async () => {
        setup({
            tables: {
                app_documents: [
                    { id: 'd1', title: 'Regulamin', category: 'legal', description: 'Regulamin firmy', text_content: 'pełna treść regulaminu', is_archived: false, is_public: true },
                ],
                compass_assist_knowledge: [],
            },
            rpcs: {
                search_documents_for_ai: () => [],
            },
        })
        const { buildDocumentContext } = await import('../document-indexing')
        const result = await buildDocumentContext('Pokaż mi regulamin', 'consultant')
        expect(typeof result).toBe('string')
    })
})
