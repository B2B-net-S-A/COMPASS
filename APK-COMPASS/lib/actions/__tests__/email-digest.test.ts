import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

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

describe('generateDailyDigest', () => {
    it('returns auth error when not signed in', async () => {
        setupClient({ user: null })
        const { generateDailyDigest } = await import('../email-digest')
        const result = await generateDailyDigest()
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/zalogowany/)
    })

    it('returns empty digest when there are no notifications in last 24h', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { notifications: [] },
        })
        const { generateDailyDigest } = await import('../email-digest')
        const result = await generateDailyDigest()
        expect(result.success).toBe(true)
        expect(result.digest).toEqual([])
    })

    it('only includes unread notifications from the last 24h for the target user', async () => {
        const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
        const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', is_read: false, type: 'system', title_pl: 'Recent unread', body_pl: '', created_at: recent },
                    { id: 'n2', user_id: 'u1', is_read: true, type: 'system', title_pl: 'Recent read', body_pl: '', created_at: recent },
                    { id: 'n3', user_id: 'u1', is_read: false, type: 'system', title_pl: 'Old unread', body_pl: '', created_at: old },
                    { id: 'n4', user_id: 'u2', is_read: false, type: 'system', title_pl: 'Other user', body_pl: '', created_at: recent },
                ],
            },
        })
        const { generateDailyDigest } = await import('../email-digest')
        const result = await generateDailyDigest() as { success: true; digest: Array<{ title: string }> }
        expect(result.digest.map(d => d.title)).toEqual(['Recent unread'])
    })

    it('falls back to title/body if title_pl/body_pl missing', async () => {
        const recent = new Date().toISOString()
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', is_read: false, type: 'system', title: 'EnTitle', body: 'EnBody', created_at: recent },
                ],
            },
        })
        const { generateDailyDigest } = await import('../email-digest')
        const result = await generateDailyDigest() as { success: true; digest: Array<{ title: string; body: string }> }
        expect(result.digest[0].title).toBe('EnTitle')
        expect(result.digest[0].body).toBe('EnBody')
    })
})

describe('getDigestHtml', () => {
    it('returns empty string when no digest items', async () => {
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: { notifications: [] },
        })
        const { getDigestHtml } = await import('../email-digest')
        const html = await getDigestHtml()
        expect(html).toBe('')
    })

    it('produces HTML containing the title and body', async () => {
        const recent = new Date().toISOString()
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', is_read: false, type: 'system', title_pl: 'Hello', body_pl: 'World', created_at: recent },
                ],
            },
        })
        const { getDigestHtml } = await import('../email-digest')
        const html = await getDigestHtml()
        expect(html).toContain('Hello')
        expect(html).toContain('World')
        expect(html).toContain('/notifications')
    })

    it('escapes HTML in title/body to prevent XSS', async () => {
        const recent = new Date().toISOString()
        setupClient({
            user: { id: 'u1', email: 'x@x.com' },
            tables: {
                notifications: [
                    { id: 'n1', user_id: 'u1', is_read: false, type: 'system', title_pl: '<script>alert("xss")</script>', body_pl: '', created_at: recent },
                ],
            },
        })
        const { getDigestHtml } = await import('../email-digest')
        const html = await getDigestHtml()
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')
    })
})
