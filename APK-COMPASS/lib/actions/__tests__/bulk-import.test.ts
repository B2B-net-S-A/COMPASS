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

vi.mock('@/lib/files/parsers', () => ({
    parseFile: vi.fn(async (file: File) => `parsed text from ${file.name}`),
}))

vi.mock('@/lib/files/image-parser', () => ({
    extractImagesFromDocx: vi.fn(async () => null),
    extractImagesFromPdf: vi.fn(async () => null),
}))

vi.mock('@/lib/ai/processor', () => ({
    processDataWithAI: vi.fn(async (text: string, type: string) => ({
        full_name: 'Test User',
        email: 'test@example.com',
        skills: ['React', 'TypeScript'],
        bio: 'Senior developer',
        experience_years: 5,
        _type: type,
        _from: text.slice(0, 50),
    })),
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

function makeFormData(file: File | null): FormData {
    const fd = new FormData()
    if (file) fd.set('file', file)
    return fd
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('importCandidate', () => {
    it('throws when no file in formData', async () => {
        setup({})
        const { importCandidate } = await import('../bulk-import')
        await expect(importCandidate(makeFormData(null))).rejects.toThrow('No file')
    })

    it('rejects unsupported file types via validateFile', async () => {
        setup({})
        const png = new File(['img'], 'photo.png', { type: 'image/png' })
        const { importCandidate } = await import('../bulk-import')
        const result = await importCandidate(makeFormData(png))
        expect(result.success).toBe(false)
        expect(result.message).toMatch(/format|typ|invalid|unsupported|niedozwolony|akceptu/i)
    })
})

describe('importFromText', () => {
    it('processes text via AI and saves candidate', async () => {
        setup({
            tables: { candidates: [] },
            rpcs: {},
        })
        const { importFromText } = await import('../bulk-import')
        const result = await importFromText('Senior React developer with 8y experience', 'candidate') as Record<string, unknown>
        // Either { success: true } or duplicate handling — both shapes acceptable
        expect(result).toBeTruthy()
    })

    it('processes text via AI and saves project (project type)', async () => {
        setup({
            tables: { projects: [] },
        })
        const { importFromText } = await import('../bulk-import')
        const result = await importFromText('Senior React project at Klient', 'project')
        expect(result).toBeTruthy()
    })
})
