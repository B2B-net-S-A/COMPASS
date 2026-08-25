import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'
import { deterministicEmbedding } from '@/test/mocks/voyage'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('@/lib/ai/embeddings', () => ({
    generateEmbedding: vi.fn(async (text: string) => deterministicEmbedding(text)),
}))

// Audyt 2026-08 (B3) — baza wiedzy jest teraz admin-only. Domyślnie guard przepuszcza,
// żeby istniejące testy zachowania zostały bez zmian; blokadę testujemy osobno.
const guard = vi.hoisted(() => ({
    requireAdminAction: vi.fn(async () => ({ userId: 'admin-1' })),
}))
vi.mock('@/lib/auth/internal-guard', () => guard)

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('createEmbedding', () => {
    it('delegates to generateEmbedding from voyage wrapper', async () => {
        const { createEmbedding } = await import('../knowledge-base')
        const v = await createEmbedding('hello')
        expect(v).toHaveLength(1024)
        const embeddings = await import('@/lib/ai/embeddings')
        expect(embeddings.generateEmbedding).toHaveBeenCalledWith('hello')
    })
})

describe('addKnowledgeDocument', () => {
    it('creates a row with content + category + metadata + generated embedding', async () => {
        setup({ tables: { compass_assist_knowledge: [] } })
        const { addKnowledgeDocument } = await import('../knowledge-base')
        await addKnowledgeDocument('How to onboard new consultants', 'onboarding', { author: 'admin' })
        const row = currentClient._tables.compass_assist_knowledge[0]
        expect(row.content).toBe('How to onboard new consultants')
        expect(row.category).toBe('onboarding')
        expect(row.metadata).toEqual({ author: 'admin' })
        expect(Array.isArray(row.embedding)).toBe(true)
        expect((row.embedding as number[]).length).toBe(1024)
    })

    it('strips newlines from content before embedding', async () => {
        const embMod = await import('@/lib/ai/embeddings')
        setup({ tables: { compass_assist_knowledge: [] } })
        const { addKnowledgeDocument } = await import('../knowledge-base')
        await addKnowledgeDocument('line one\nline two\nline three', 'general')
        expect(embMod.generateEmbedding).toHaveBeenCalledWith('line one line two line three')
    })
})

describe('getKnowledgeHistory', () => {
    it('returns all rows when no category filter, sorted desc by created_at', async () => {
        setup({
            tables: {
                compass_assist_knowledge: [
                    { id: 'k1', content: 'old', category: 'general', metadata: {}, created_at: '2026-01-01', updated_at: '2026-01-01' },
                    { id: 'k2', content: 'mid', category: 'onboarding', metadata: {}, created_at: '2026-04-01', updated_at: '2026-04-01' },
                    { id: 'k3', content: 'new', category: 'general', metadata: {}, created_at: '2026-04-15', updated_at: '2026-04-15' },
                ],
            },
        })
        const { getKnowledgeHistory } = await import('../knowledge-base')
        const result = await getKnowledgeHistory()
        expect(result.map(r => r.id)).toEqual(['k3', 'k2', 'k1'])
    })

    it('filters by category when provided', async () => {
        setup({
            tables: {
                compass_assist_knowledge: [
                    { id: 'k1', content: 'a', category: 'general', metadata: {}, created_at: '2026-01-01', updated_at: '2026-01-01' },
                    { id: 'k2', content: 'b', category: 'onboarding', metadata: {}, created_at: '2026-04-01', updated_at: '2026-04-01' },
                    { id: 'k3', content: 'c', category: 'onboarding', metadata: {}, created_at: '2026-04-15', updated_at: '2026-04-15' },
                ],
            },
        })
        const { getKnowledgeHistory } = await import('../knowledge-base')
        const result = await getKnowledgeHistory('onboarding')
        expect(result.map(r => r.id).sort()).toEqual(['k2', 'k3'])
    })
})

describe('deleteKnowledgeDocument', () => {
    it('removes the row matching id', async () => {
        setup({
            tables: {
                compass_assist_knowledge: [
                    { id: 'k1', content: 'a', category: 'general' },
                    { id: 'k2', content: 'b', category: 'general' },
                ],
            },
        })
        const { deleteKnowledgeDocument } = await import('../knowledge-base')
        await deleteKnowledgeDocument('k1')
        expect(currentClient._tables.compass_assist_knowledge.map((k: any) => k.id)).toEqual(['k2'])
    })
})

describe('searchKnowledge', () => {
    it('calls match_assist_knowledge RPC with query embedding', async () => {
        const rpcSpy = vi.fn(async () => [{ id: 'k1', content: 'match', similarity: 0.9 }])
        setup({ rpcs: { match_assist_knowledge: rpcSpy } })
        const { searchKnowledge } = await import('../knowledge-base')
        const result = await searchKnowledge('how to start')
        expect(result).toEqual([{ id: 'k1', content: 'match', similarity: 0.9 }])
        expect(rpcSpy).toHaveBeenCalledOnce()
        expect((rpcSpy.mock.calls[0] as unknown[])[0]).toMatchObject({
            match_threshold: 0.3,
            match_count: 5,
            filter_category: null,
        })
    })

    it('forwards category filter to RPC', async () => {
        const rpcSpy = vi.fn(async () => [])
        setup({ rpcs: { match_assist_knowledge: rpcSpy } })
        const { searchKnowledge } = await import('../knowledge-base')
        await searchKnowledge('q', 'onboarding')
        expect((rpcSpy.mock.calls[0] as unknown[])[0]).toMatchObject({ filter_category: 'onboarding' })
    })
})

describe('uploadKnowledgeFile — validation', () => {
    function makeFormData(file: File | null): FormData {
        const fd = new FormData()
        if (file) fd.set('file', file)
        return fd
    }

    it('rejects when no file provided', async () => {
        setup({})
        const { uploadKnowledgeFile } = await import('../knowledge-base')
        const result = await uploadKnowledgeFile(makeFormData(null), 'general')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/Brak pliku/)
    })

    it('rejects unsupported file types (e.g. .png)', async () => {
        setup({})
        const png = new File(['img'], 'photo.png', { type: 'image/png' })
        const { uploadKnowledgeFile } = await import('../knowledge-base')
        const result = await uploadKnowledgeFile(makeFormData(png), 'general')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/PDF, DOCX/)
    })

    it('rejects files larger than 20MB', async () => {
        setup({})
        const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
        const { uploadKnowledgeFile } = await import('../knowledge-base')
        const result = await uploadKnowledgeFile(makeFormData(big), 'general')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/20MB/i)
    })
})

describe('guard admina', () => {
    it('blokuje każdą akcję zapisu/odczytu, gdy wywołujący nie jest adminem', async () => {
        setup({ tables: { compass_assist_knowledge: [] } })
        const mod = await import('../knowledge-base')

        const cases: Array<[string, () => Promise<unknown>]> = [
            ['createEmbedding', () => mod.createEmbedding('x')],
            ['addKnowledgeDocument', () => mod.addKnowledgeDocument('x', 'general')],
            ['getKnowledgeHistory', () => mod.getKnowledgeHistory()],
            ['deleteKnowledgeDocument', () => mod.deleteKnowledgeDocument('k1')],
            ['searchKnowledge', () => mod.searchKnowledge('x')],
        ]

        for (const [, call] of cases) {
            guard.requireAdminAction.mockRejectedValueOnce(new Error('Wymagane uprawnienia administratora.'))
            await expect(call()).rejects.toThrow(/administratora/)
        }

        // Ta jedna zwraca błąd zamiast rzucać — kontrakt jej wywołujących.
        guard.requireAdminAction.mockRejectedValueOnce(new Error('Wymagane uprawnienia administratora.'))
        const fd = new FormData()
        fd.set('file', new File(['x'], 'doc.pdf', { type: 'application/pdf' }))
        const result = await mod.uploadKnowledgeFile(fd, 'general')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/administratora/)
    })

    it('nie pali embeddingu, gdy guard odrzuci wywołanie', async () => {
        setup({ tables: { compass_assist_knowledge: [] } })
        const embMod = await import('@/lib/ai/embeddings')
        const mod = await import('../knowledge-base')

        guard.requireAdminAction.mockRejectedValueOnce(new Error('Wymagane uprawnienia administratora.'))
        await expect(mod.createEmbedding('drogi tekst')).rejects.toThrow()
        expect(embMod.generateEmbedding).not.toHaveBeenCalled()
    })
})
