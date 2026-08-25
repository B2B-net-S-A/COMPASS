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

// Audyt 2026-08 (B3) — akcje admin* są teraz za guardem. Domyślnie przepuszcza,
// żeby nie zmieniać istniejących testów uploadu użytkownika.
const guard = vi.hoisted(() => ({
    requireAdminAction: vi.fn(async () => ({ userId: 'admin-1' })),
}))
vi.mock('@/lib/auth/internal-guard', () => guard)

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

describe('uploadAvatar', () => {
    it('throws when no file', async () => {
        setup({})
        const { uploadAvatar } = await import('../files')
        await expect(uploadAvatar(makeFormData(null))).rejects.toThrow('No file')
    })

    it('rejects file >5MB (avatar limit)', async () => {
        setup({})
        const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
        const { uploadAvatar } = await import('../files')
        await expect(uploadAvatar(makeFormData(big))).rejects.toThrow(/za duży/)
    })

    it('throws when not authenticated', async () => {
        setup({ user: null })
        const small = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
        const { uploadAvatar } = await import('../files')
        await expect(uploadAvatar(makeFormData(small))).rejects.toThrow(/zalogowany/)
    })

    it('uploads + writes avatar_url to profile on happy path', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: { profiles: [{ id: 'u1', avatar_url: null }] },
        })
        const small = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
        const { uploadAvatar } = await import('../files')
        const result = await uploadAvatar(makeFormData(small))
        expect(result.success).toBe(true)
        expect(typeof result.url).toBe('string')
        const profile = currentClient._tables.profiles[0]
        expect(profile.avatar_url).toBeTruthy()
    })
})

describe('uploadCV — auth & size validation', () => {
    it('throws when no file (Polish error)', async () => {
        setup({})
        const { uploadCV } = await import('../files')
        await expect(uploadCV(makeFormData(null))).rejects.toThrow('Nie wybrano pliku')
    })

    it('rejects CV >20MB', async () => {
        setup({})
        const big = new File([new Uint8Array(21 * 1024 * 1024)], 'cv.pdf', { type: 'application/pdf' })
        const { uploadCV } = await import('../files')
        await expect(uploadCV(makeFormData(big))).rejects.toThrow(/za duży/)
    })

    it('throws when not authenticated', async () => {
        setup({ user: null })
        const small = new File(['x'], 'cv.pdf', { type: 'application/pdf' })
        const { uploadCV } = await import('../files')
        await expect(uploadCV(makeFormData(small))).rejects.toThrow(/zalogowany/)
    })
})

describe('akcje administracyjne — guard', () => {
    it('adminUploadCV odrzuca wywołanie bez uprawnień administratora', async () => {
        setup({})
        guard.requireAdminAction.mockRejectedValueOnce(new Error('Wymagane uprawnienia administratora.'))
        const { adminUploadCV } = await import('../files')
        const pdf = new File(['cv'], 'cv.pdf', { type: 'application/pdf' })
        await expect(adminUploadCV(makeFormData(pdf), 'cand-1')).rejects.toThrow(/administratora/)
    })

    it('adminGenerateProfileFromCV nie sięga do Storage ani do LLM bez uprawnień', async () => {
        const client = setup({})
        guard.requireAdminAction.mockRejectedValueOnce(new Error('Wymagane uprawnienia administratora.'))
        const { adminGenerateProfileFromCV } = await import('../files')
        await expect(adminGenerateProfileFromCV('cand-1', 'documents/cudze/cv.pdf')).rejects.toThrow(/administratora/)
        expect(client.storage.from).not.toHaveBeenCalled()
    })
})
