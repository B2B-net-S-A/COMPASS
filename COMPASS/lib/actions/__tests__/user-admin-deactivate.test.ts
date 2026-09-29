import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// „Dezaktywuj konto" — natychmiastowe odcięcie dostępu bez procesu offboardingu.

const mockGetUser = vi.fn()
const mockGetUserById = vi.fn()
const mockProfilesUpdate = vi.fn()
const mockProfilesUpdateEq = vi.fn()
const mockLifecycleInsert = vi.fn()
const mockRevoke = vi.fn()
const mockLogAudit = vi.fn()
const mockIsSuperAdmin = vi.fn((_email: string | null | undefined) => false)

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        auth: { admin: { getUserById: mockGetUserById } },
        from: (table: string) => {
            if (table === 'profiles') return { update: mockProfilesUpdate }
            if (table === 'lifecycle_events') return { insert: mockLifecycleInsert }
            throw new Error(`Unexpected table: ${table}`)
        },
    }),
}))

vi.mock('@/lib/auth/account-access', () => ({
    revokeAccountAccess: (...args: unknown[]) => mockRevoke(...args),
}))
vi.mock('@/lib/email', () => ({ sendRoleChangeEmail: vi.fn() }))
vi.mock('@/lib/actions/audit', () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }))
vi.mock('@/lib/auth/super-admins', () => ({
    getSuperAdmins: () => ['admin@b2b.pl', 'other-super@b2b.pl'],
    isSuperAdmin: (email: string | null | undefined) => mockIsSuperAdmin(email),
}))

function loginAs(id: string, email: string) {
    mockGetUser.mockResolvedValue({ data: { user: { id, email } } })
}

beforeEach(() => {
    mockIsSuperAdmin.mockImplementation((e) => e === 'admin@b2b.pl' || e === 'other-super@b2b.pl')
    loginAs('super-1', 'admin@b2b.pl')
    mockGetUserById.mockResolvedValue({ data: { user: { id: 'target-1', email: 'martyna@b2b.pl' } }, error: null })
    mockProfilesUpdateEq.mockResolvedValue({ error: null })
    mockProfilesUpdate.mockImplementation(() => ({ eq: mockProfilesUpdateEq }))
    mockLifecycleInsert.mockResolvedValue({ error: null })
    mockRevoke.mockResolvedValue(undefined)
    mockLogAudit.mockResolvedValue(undefined)
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('deactivateEmployee', () => {
    it('sets exited + last work day, blocks the Auth account and records the exit', async () => {
        const { deactivateEmployee } = await import('../user-admin')
        const res = await deactivateEmployee('target-1', '2026-09-30')

        expect(res).toEqual({ success: true, data: undefined })
        expect(mockProfilesUpdate).toHaveBeenCalledWith({
            employment_status: 'exited',
            termination_date: '2026-09-30',
        })
        expect(mockProfilesUpdateEq).toHaveBeenCalledWith('id', 'target-1')
        expect(mockRevoke).toHaveBeenCalledWith('target-1')
        expect(mockLifecycleInsert).toHaveBeenCalledWith(
            expect.objectContaining({ user_id: 'target-1', event_type: 'exited', created_by: 'super-1' }),
        )
        expect(mockLogAudit).toHaveBeenCalledWith(
            'super-1',
            'EMPLOYEE_EXITED',
            expect.objectContaining({ user_id: 'target-1', source: 'deactivate' }),
        )
    })

    it('shows the guard message to a non super admin (not the generic prod mask) and writes nothing', async () => {
        loginAs('user-1', 'user@b2b.pl')
        const { deactivateEmployee } = await import('../user-admin')
        const res = await deactivateEmployee('target-1', '2026-09-30')

        expect(res.success).toBe(false)
        expect(!res.success && res.error).toMatch(/Super Admina/)
        expect(mockProfilesUpdate).not.toHaveBeenCalled()
        expect(mockRevoke).not.toHaveBeenCalled()
    })

    it('refuses to deactivate own account', async () => {
        mockGetUserById.mockResolvedValue({ data: { user: { id: 'super-1', email: 'admin@b2b.pl' } }, error: null })
        const { deactivateEmployee } = await import('../user-admin')
        const res = await deactivateEmployee('super-1', '2026-09-30')

        expect(res.success).toBe(false)
        expect(mockRevoke).not.toHaveBeenCalled()
    })

    it('refuses to deactivate another super admin', async () => {
        mockGetUserById.mockResolvedValue({ data: { user: { id: 'super-2', email: 'other-super@b2b.pl' } }, error: null })
        const { deactivateEmployee } = await import('../user-admin')
        const res = await deactivateEmployee('super-2', '2026-09-30')

        expect(!res.success && res.error).toMatch(/innego Super Admina/)
        expect(mockProfilesUpdate).not.toHaveBeenCalled()
    })

    it('rejects a malformed last work day', async () => {
        const { deactivateEmployee } = await import('../user-admin')
        const res = await deactivateEmployee('target-1', '30.09.2026')

        expect(!res.success && res.error).toMatch(/YYYY-MM-DD/)
        expect(mockProfilesUpdate).not.toHaveBeenCalled()
    })

    it('tells the admin to retry when the Auth block fails (status alone does not cut the Data API)', async () => {
        mockRevoke.mockRejectedValue(new Error('auth down'))
        const { deactivateEmployee } = await import('../user-admin')
        const res = await deactivateEmployee('target-1', '2026-09-30')

        expect(!res.success && res.error).toMatch(/nie udało się zablokować konta/)
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('does not block the account when the status write fails', async () => {
        mockProfilesUpdateEq.mockResolvedValue({ error: { message: 'boom' } })
        const { deactivateEmployee } = await import('../user-admin')
        const res = await deactivateEmployee('target-1', '2026-09-30')

        expect(res.success).toBe(false)
        expect(mockRevoke).not.toHaveBeenCalled()
    })
})
