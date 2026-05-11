import { describe, expect, it, vi, beforeEach } from 'vitest'

// Helper mock — robi się .from('profiles').select('role').eq().maybeSingle()
function mockSupabase(user: { id: string; email: string } | null, role: string | null) {
    const profileChain = {
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: role ? { role } : null, error: null })),
            })),
        })),
    }
    return {
        auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
        from: vi.fn((_table: string) => profileChain),
    }
}

let currentClient: ReturnType<typeof mockSupabase>

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

// React cache memoizuje na resztę testu modułu — reset modułów + clear mocks
// żeby każdy test miał świeży stan.
beforeEach(() => {
    vi.resetModules()
})

describe('getCurrentUserProfile', () => {
    it('returns null when not authenticated', async () => {
        currentClient = mockSupabase(null, null)
        const { getCurrentUserProfile } = await import('../getProfile')
        const result = await getCurrentUserProfile()
        expect(result).toBeNull()
    })

    it('returns profile with role for authenticated user', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'admin')
        const { getCurrentUserProfile } = await import('../getProfile')
        const result = await getCurrentUserProfile()
        expect(result).toEqual({ id: 'u1', email: 'a@b.com', role: 'admin' })
    })

    it('defaults to consultant when profile row missing', async () => {
        currentClient = mockSupabase({ id: 'u2', email: 'b@c.com' }, null)
        const { getCurrentUserProfile } = await import('../getProfile')
        const result = await getCurrentUserProfile()
        expect(result?.role).toBe('consultant')
    })
})

describe('requireAuth', () => {
    it('throws when not authenticated', async () => {
        currentClient = mockSupabase(null, null)
        const { requireAuth } = await import('../getProfile')
        await expect(requireAuth()).rejects.toThrow('Nie jesteś zalogowany')
    })

    it('returns profile for authenticated user', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'consultant')
        const { requireAuth } = await import('../getProfile')
        const result = await requireAuth()
        expect(result.id).toBe('u1')
    })
})

describe('requireRole', () => {
    it('throws when role does not match', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'consultant')
        const { requireRole } = await import('../getProfile')
        await expect(requireRole('admin')).rejects.toThrow(/admin/)
    })

    it('returns profile when role matches', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'admin')
        const { requireRole } = await import('../getProfile')
        const result = await requireRole('admin')
        expect(result.role).toBe('admin')
    })
})

describe('requireAnyRole', () => {
    it('throws when role not in allowed list', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'consultant')
        const { requireAnyRole } = await import('../getProfile')
        await expect(requireAnyRole('admin', 'internal')).rejects.toThrow(/admin lub internal/)
    })

    it('returns profile when role in allowed list (admin)', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'admin')
        const { requireAnyRole } = await import('../getProfile')
        const result = await requireAnyRole('admin', 'internal')
        expect(result.role).toBe('admin')
    })

    it('returns profile when role in allowed list (internal)', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'internal')
        const { requireAnyRole } = await import('../getProfile')
        const result = await requireAnyRole('admin', 'internal')
        expect(result.role).toBe('internal')
    })
})

describe('tryGetRole', () => {
    it('returns null when not authenticated', async () => {
        currentClient = mockSupabase(null, null)
        const { tryGetRole } = await import('../getProfile')
        expect(await tryGetRole()).toBeNull()
    })

    it('returns role string when authenticated', async () => {
        currentClient = mockSupabase({ id: 'u1', email: 'a@b.com' }, 'internal')
        const { tryGetRole } = await import('../getProfile')
        expect(await tryGetRole()).toBe('internal')
    })
})
