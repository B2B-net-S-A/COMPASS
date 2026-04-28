import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'
import { CURRENT_TERMS_VERSION } from '@/lib/constants/compliance'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

function setupClient(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('checkUserConsents', () => {
    it('returns null when not authenticated', async () => {
        setupClient({ user: null })
        const { checkUserConsents } = await import('../compliance')
        expect(await checkUserConsents()).toBeNull()
    })

    it('returns null when no consent record exists for current terms version', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { um_user_consents: [] },
        })
        const { checkUserConsents } = await import('../compliance')
        expect(await checkUserConsents()).toBeNull()
    })

    it('returns null when any consent flag is false (treated as no-consent)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                um_user_consents: [{
                    id: 'c1',
                    user_id: 'u1',
                    accepted_terms: true,
                    accepted_privacy: true,
                    accepted_data_processing: false,
                    accepted_ai: true,
                    terms_version: CURRENT_TERMS_VERSION,
                    accepted_at: '2026-04-01T00:00:00Z',
                    accepted_ip: null,
                    accepted_ua: null,
                }],
            },
        })
        const { checkUserConsents } = await import('../compliance')
        expect(await checkUserConsents()).toBeNull()
    })

    it('returns the consent record when all 4 flags are true', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                um_user_consents: [{
                    id: 'c1',
                    user_id: 'u1',
                    accepted_terms: true,
                    accepted_privacy: true,
                    accepted_data_processing: true,
                    accepted_ai: true,
                    terms_version: CURRENT_TERMS_VERSION,
                    accepted_at: '2026-04-01T00:00:00Z',
                    accepted_ip: '127.0.0.1',
                    accepted_ua: 'test',
                }],
            },
        })
        const { checkUserConsents } = await import('../compliance')
        const result = await checkUserConsents()
        expect(result).not.toBeNull()
        expect(result!.accepted_terms).toBe(true)
    })
})

describe('saveUserConsents', () => {
    it('returns error when not authenticated', async () => {
        setupClient({ user: null })
        const { saveUserConsents } = await import('../compliance')
        const result = await saveUserConsents({
            accepted_terms: true,
            accepted_privacy: true,
            accepted_data_processing: true,
            accepted_ai: true,
        })
        expect(result.error).toBe('Nie jesteś zalogowany.')
    })

    it('rejects when ANY checkbox is false (all 4 required)', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { um_user_consents: [] },
        })
        const { saveUserConsents } = await import('../compliance')
        const result = await saveUserConsents({
            accepted_terms: true,
            accepted_privacy: true,
            accepted_data_processing: false,
            accepted_ai: true,
        })
        expect(result.error).toBe('Wszystkie zgody są wymagane.')
    })

    it('inserts consent row on success with current terms_version', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { um_user_consents: [] },
        })
        const { saveUserConsents } = await import('../compliance')
        const result = await saveUserConsents({
            accepted_terms: true,
            accepted_privacy: true,
            accepted_data_processing: true,
            accepted_ai: true,
        })
        expect(result.error).toBeUndefined()
        const row = currentClient._tables.um_user_consents[0]
        expect(row.user_id).toBe('u1')
        expect(row.terms_version).toBe(CURRENT_TERMS_VERSION)
        expect(row.accepted_terms).toBe(true)
    })
})

describe('getLegalDocument', () => {
    it('returns null when slug not found', async () => {
        setupClient({ tables: { um_legal_documents: [] } })
        const { getLegalDocument } = await import('../compliance')
        expect(await getLegalDocument('does-not-exist')).toBeNull()
    })

    it('returns the document when found and active', async () => {
        setupClient({
            tables: {
                um_legal_documents: [
                    { id: 'd1', slug: 'privacy', title: 'Privacy', content_html: '<p/>', version: '1.0', is_active: true, requires_acceptance: true, visibility: 'public', created_at: '', updated_at: '' },
                    { id: 'd2', slug: 'old-privacy', title: 'Old', content_html: '<p/>', version: '0.9', is_active: false, requires_acceptance: true, visibility: 'public', created_at: '', updated_at: '' },
                ],
            },
        })
        const { getLegalDocument } = await import('../compliance')
        const doc = await getLegalDocument('privacy')
        expect(doc?.slug).toBe('privacy')
    })

    it('does not return inactive documents', async () => {
        setupClient({
            tables: {
                um_legal_documents: [
                    { id: 'd1', slug: 'privacy', is_active: false, title: 'P', content_html: '', version: '1.0', requires_acceptance: false, visibility: 'public', created_at: '', updated_at: '' },
                ],
            },
        })
        const { getLegalDocument } = await import('../compliance')
        expect(await getLegalDocument('privacy')).toBeNull()
    })
})

describe('listLegalDocuments', () => {
    it('returns empty array when no docs exist', async () => {
        setupClient({ tables: { um_legal_documents: [] } })
        const { listLegalDocuments } = await import('../compliance')
        expect(await listLegalDocuments()).toEqual([])
    })

    it('returns only active documents', async () => {
        setupClient({
            tables: {
                um_legal_documents: [
                    { id: 'd1', slug: 's1', title: 'Active', is_active: true, content_html: '', version: '1.0', requires_acceptance: false, visibility: 'public', created_at: '', updated_at: '' },
                    { id: 'd2', slug: 's2', title: 'Inactive', is_active: false, content_html: '', version: '1.0', requires_acceptance: false, visibility: 'public', created_at: '', updated_at: '' },
                ],
            },
        })
        const { listLegalDocuments } = await import('../compliance')
        const docs = await listLegalDocuments()
        expect(docs).toHaveLength(1)
        expect(docs[0].slug).toBe('s1')
    })

    it('filters by visibility when provided', async () => {
        setupClient({
            tables: {
                um_legal_documents: [
                    { id: 'd1', slug: 's1', title: 'Public', is_active: true, visibility: 'public', content_html: '', version: '1.0', requires_acceptance: false, created_at: '', updated_at: '' },
                    { id: 'd2', slug: 's2', title: 'Admin', is_active: true, visibility: 'admin', content_html: '', version: '1.0', requires_acceptance: false, created_at: '', updated_at: '' },
                ],
            },
        })
        const { listLegalDocuments } = await import('../compliance')
        const adminDocs = await listLegalDocuments('admin')
        expect(adminDocs).toHaveLength(1)
        expect(adminDocs[0].slug).toBe('s2')
    })
})

describe('listAllConsents', () => {
    it('returns consents in reverse chronological order, capped by limit', async () => {
        setupClient({
            tables: {
                um_user_consents: [
                    { id: '1', user_id: 'u1', accepted_at: '2026-01-01T00:00:00Z', accepted_terms: true, accepted_privacy: true, accepted_data_processing: true, accepted_ai: true, terms_version: '1.0', accepted_ip: null, accepted_ua: null },
                    { id: '2', user_id: 'u2', accepted_at: '2026-04-01T00:00:00Z', accepted_terms: true, accepted_privacy: true, accepted_data_processing: true, accepted_ai: true, terms_version: '1.0', accepted_ip: null, accepted_ua: null },
                    { id: '3', user_id: 'u3', accepted_at: '2026-02-01T00:00:00Z', accepted_terms: true, accepted_privacy: true, accepted_data_processing: true, accepted_ai: true, terms_version: '1.0', accepted_ip: null, accepted_ua: null },
                ],
            },
        })
        const { listAllConsents } = await import('../compliance')
        const list = await listAllConsents(2)
        expect(list).toHaveLength(2)
        expect(list[0].id).toBe('2')
        expect(list[1].id).toBe('3')
    })
})
