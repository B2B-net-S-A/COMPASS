import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient } from '@/test/mocks/supabase'

/**
 * Audyt 2026-09-22 (O07): pobieranie z prywatnego bucketu `documents` idzie przez
 * podpisany URL wydawany po kontroli dostępu (właściciel ∨ publiczny ∨ admin).
 * Link podpisuje service-role, więc ta kontrola jest JEDYNĄ barierą — testy
 * pilnują, że obcy użytkownik i wygasła sesja nie dostają URL-a.
 */

const state = vi.hoisted(() => ({
    db: null as unknown,
    ctx: null as null | { userId: string; isAdmin: boolean },
    createSignedUrl: null as unknown as ReturnType<typeof vi.fn>,
}))

vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => state.db }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => state.db }))
vi.mock('@/lib/auth/internal-guard', async () => {
    const { SessionExpiredError } = await import('@/lib/actions/expected-error')
    return {
        requireAuthenticatedAction: async () => {
            if (!state.ctx) throw new SessionExpiredError()
            return state.ctx
        },
    }
})
vi.mock('../document-indexing', () => ({ indexDocumentText: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logCompat: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getDocumentDownloadUrl } from '../documents'

const OWNER = 'owner-1'
const STRANGER = 'stranger-2'

function setupDb(opts: { isPublic?: boolean } = {}) {
    const client = createMockSupabaseClient({
        tables: {
            app_documents: [{ id: 'doc-1', owner_id: OWNER, is_public: opts.isPublic ?? false }],
            document_versions: [
                { id: 'ver-1', document_id: 'doc-1', file_url: `app-docs/${OWNER}/1_umowa.pdf`, file_name: 'umowa.pdf' },
            ],
        },
    })
    state.createSignedUrl = vi.fn(async (path: string, ttl: number) => ({
        data: { signedUrl: `https://signed.example/${path}?ttl=${ttl}` },
        error: null,
    }))
    const signer = { createSignedUrl: state.createSignedUrl }
    ;(client as unknown as { storage: { from: (bucket: string) => unknown } }).storage = {
        from: vi.fn((bucket: string) => {
            expect(bucket).toBe('documents')
            return signer
        }),
    }
    state.db = client
}

describe('getDocumentDownloadUrl', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setupDb()
    })

    it('owner receives a 300 s signed URL for the stored path', async () => {
        state.ctx = { userId: OWNER, isAdmin: false }
        const result = await getDocumentDownloadUrl('ver-1')
        expect(result).toEqual({
            success: true,
            data: { url: `https://signed.example/app-docs/${OWNER}/1_umowa.pdf?ttl=300` },
        })
        expect(state.createSignedUrl).toHaveBeenCalledWith(`app-docs/${OWNER}/1_umowa.pdf`, 300, { download: 'umowa.pdf' })
    })

    it('another user is refused and no URL is signed', async () => {
        state.ctx = { userId: STRANGER, isAdmin: false }
        const result = await getDocumentDownloadUrl('ver-1')
        expect(result.success).toBe(false)
        expect(state.createSignedUrl).not.toHaveBeenCalled()
    })

    it('admin may download someone else’s private document', async () => {
        state.ctx = { userId: STRANGER, isAdmin: true }
        const result = await getDocumentDownloadUrl('ver-1')
        expect(result.success).toBe(true)
    })

    it('any signed-in user may download a public document', async () => {
        setupDb({ isPublic: true })
        state.ctx = { userId: STRANGER, isAdmin: false }
        const result = await getDocumentDownloadUrl('ver-1')
        expect(result.success).toBe(true)
    })

    it('expired session is refused without signing', async () => {
        state.ctx = null
        const result = await getDocumentDownloadUrl('ver-1')
        expect(result.success).toBe(false)
        expect(state.createSignedUrl).not.toHaveBeenCalled()
    })

    it('unknown version gives the same answer as a forbidden one', async () => {
        state.ctx = { userId: STRANGER, isAdmin: false }
        const forbidden = await getDocumentDownloadUrl('ver-1')
        state.ctx = { userId: OWNER, isAdmin: false }
        const missing = await getDocumentDownloadUrl('ver-does-not-exist')
        expect(missing).toEqual(forbidden)
        expect(state.createSignedUrl).not.toHaveBeenCalled()
    })

    it('rejects an empty version id', async () => {
        state.ctx = { userId: OWNER, isAdmin: false }
        const result = await getDocumentDownloadUrl('')
        expect(result).toEqual({ success: false, error: 'Brak identyfikatora wersji dokumentu.' })
    })
})
