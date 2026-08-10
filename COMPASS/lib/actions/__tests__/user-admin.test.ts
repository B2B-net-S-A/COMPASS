import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockListUsers = vi.fn()
const mockGetUserById = vi.fn()
const mockUpdateUserById = vi.fn()
const mockResetPasswordForEmail = vi.fn()
const mockRpc = vi.fn()
const mockFromProfiles = vi.fn()
const mockFromAdminAccessList = vi.fn()
const mockProfilesSelectSingle = vi.fn()
const mockProfilesUpdate = vi.fn()
const mockProfilesUpdateEq = vi.fn()
const mockAdminListUpsert = vi.fn()
const mockAdminListDeleteEq = vi.fn()
const mockSendRoleChangeEmail = vi.fn()
const mockLogAudit = vi.fn()
const mockGetSuperAdmins = vi.fn(() => [] as readonly string[])
const mockIsSuperAdmin = vi.fn((_email: string | null | undefined) => false)

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        auth: {
            getUser: mockGetUser,
        },
    }),
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        auth: {
            admin: {
                listUsers: mockListUsers,
                getUserById: mockGetUserById,
                updateUserById: mockUpdateUserById,
            },
            resetPasswordForEmail: mockResetPasswordForEmail,
        },
        rpc: mockRpc,
        from: (table: string) => {
            if (table === 'profiles') return mockFromProfiles()
            if (table === 'admin_access_list') return mockFromAdminAccessList()
            throw new Error(`Unexpected table: ${table}`)
        },
    }),
}))

vi.mock('@/lib/email', () => ({
    sendRoleChangeEmail: (...args: unknown[]) => mockSendRoleChangeEmail(...args),
}))

vi.mock('@/lib/actions/audit', () => ({
    logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

vi.mock('@/lib/auth/super-admins', () => ({
    getSuperAdmins: () => mockGetSuperAdmins(),
    isSuperAdmin: (email: string | null | undefined) => mockIsSuperAdmin(email),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUPER_ADMINS = ['admin@b2b.pl', 'other-super@b2b.pl'] as const

function loginAsSuperAdmin(id = 'super-1', email = SUPER_ADMINS[0]) {
    mockGetUser.mockResolvedValue({ data: { user: { id, email } } })
    mockIsSuperAdmin.mockImplementation((e) =>
        !!e && SUPER_ADMINS.includes(e.toLowerCase() as (typeof SUPER_ADMINS)[number])
    )
    mockGetSuperAdmins.mockReturnValue(SUPER_ADMINS)
}

function loginAsRegularUser(id = 'user-1', email = 'user@b2b.pl') {
    mockGetUser.mockResolvedValue({ data: { user: { id, email } } })
    mockIsSuperAdmin.mockImplementation(() => false)
    mockGetSuperAdmins.mockReturnValue(SUPER_ADMINS)
}

function noLogin() {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetSuperAdmins.mockReturnValue(SUPER_ADMINS)
    mockIsSuperAdmin.mockImplementation(() => false)
}

beforeEach(() => {
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null })
    mockGetUserById.mockResolvedValue({
        data: { user: { id: 'target-1', email: 'target@b2b.pl' } },
        error: null,
    })
    mockUpdateUserById.mockResolvedValue({ data: { user: {} }, error: null })
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    mockRpc.mockResolvedValue({ error: null })
    mockProfilesSelectSingle.mockResolvedValue({
        data: { role: 'consultant', full_name: 'Target User' },
        error: null,
    })
    mockProfilesUpdateEq.mockResolvedValue({ error: null })
    mockProfilesUpdate.mockImplementation(() => ({ eq: mockProfilesUpdateEq }))
    mockFromProfiles.mockReturnValue({
        select: () => ({
            in: async () => ({ data: [], error: null }),
            eq: () => ({ single: mockProfilesSelectSingle }),
        }),
        update: mockProfilesUpdate,
    })
    mockAdminListUpsert.mockResolvedValue({ error: null })
    mockAdminListDeleteEq.mockResolvedValue({ error: null })
    mockFromAdminAccessList.mockReturnValue({
        upsert: mockAdminListUpsert,
        delete: () => ({ eq: mockAdminListDeleteEq }),
    })
    mockSendRoleChangeEmail.mockResolvedValue(undefined)
    mockLogAudit.mockResolvedValue(undefined)
})

afterEach(() => {
    vi.clearAllMocks()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('user-admin: guards', () => {
    it('listAllUsers throws Unauthorized when not logged in', async () => {
        noLogin()
        const { listAllUsers } = await import('../user-admin')
        await expect(listAllUsers()).rejects.toThrow('Unauthorized')
    })

    it('listAllUsers throws when logged in but not super admin', async () => {
        loginAsRegularUser()
        const { listAllUsers } = await import('../user-admin')
        await expect(listAllUsers()).rejects.toThrow(/Super Admina/)
    })

    it('sendPasswordResetLink throws when not super admin', async () => {
        loginAsRegularUser()
        const { sendPasswordResetLink } = await import('../user-admin')
        await expect(sendPasswordResetLink('target-1')).rejects.toThrow(/Super Admina/)
    })

    it('forceSetPassword throws when not super admin', async () => {
        loginAsRegularUser()
        const { forceSetPassword } = await import('../user-admin')
        await expect(forceSetPassword('target-1', 'StrongPass1')).rejects.toThrow(/Super Admina/)
    })

    it('signOutAllSessions throws when not super admin', async () => {
        loginAsRegularUser()
        const { signOutAllSessions } = await import('../user-admin')
        await expect(signOutAllSessions('target-1')).rejects.toThrow(/Super Admina/)
    })

    it('setUserBan throws when not super admin', async () => {
        loginAsRegularUser()
        const { setUserBan } = await import('../user-admin')
        await expect(setUserBan('target-1', true)).rejects.toThrow(/Super Admina/)
    })
})

describe('user-admin: self-protection', () => {
    it('forceSetPassword forbids self-modification', async () => {
        loginAsSuperAdmin('super-1', SUPER_ADMINS[0])
        mockGetUserById.mockResolvedValue({
            data: { user: { id: 'super-1', email: SUPER_ADMINS[0] } },
            error: null,
        })
        const { forceSetPassword } = await import('../user-admin')
        await expect(forceSetPassword('super-1', 'StrongPass1')).rejects.toThrow(/własnego konta/)
    })

    it('forceSetPassword forbids modifying another Super Admin', async () => {
        loginAsSuperAdmin('super-1', SUPER_ADMINS[0])
        mockGetUserById.mockResolvedValue({
            data: { user: { id: 'super-2', email: SUPER_ADMINS[1] } },
            error: null,
        })
        const { forceSetPassword } = await import('../user-admin')
        await expect(forceSetPassword('super-2', 'StrongPass1')).rejects.toThrow(/Super Admina/)
    })

    it('setUserBan forbids modifying another Super Admin', async () => {
        loginAsSuperAdmin('super-1', SUPER_ADMINS[0])
        mockGetUserById.mockResolvedValue({
            data: { user: { id: 'super-2', email: SUPER_ADMINS[1] } },
            error: null,
        })
        const { setUserBan } = await import('../user-admin')
        await expect(setUserBan('super-2', true)).rejects.toThrow(/Super Admina/)
    })

    it('signOutAllSessions forbids self-modification', async () => {
        loginAsSuperAdmin('super-1', SUPER_ADMINS[0])
        mockGetUserById.mockResolvedValue({
            data: { user: { id: 'super-1', email: SUPER_ADMINS[0] } },
            error: null,
        })
        const { signOutAllSessions } = await import('../user-admin')
        await expect(signOutAllSessions('super-1')).rejects.toThrow(/własnego konta/)
    })
})

describe('user-admin: password validation', () => {
    beforeEach(() => {
        loginAsSuperAdmin()
    })

    it('rejects short passwords', async () => {
        const { forceSetPassword } = await import('../user-admin')
        await expect(forceSetPassword('target-1', 'a1b')).rejects.toThrow(/minimum 8/)
    })

    it('rejects passwords without digits', async () => {
        const { forceSetPassword } = await import('../user-admin')
        await expect(forceSetPassword('target-1', 'NoDigitsHere')).rejects.toThrow(/cyfrę/)
    })

    it('rejects passwords without letters', async () => {
        const { forceSetPassword } = await import('../user-admin')
        await expect(forceSetPassword('target-1', '12345678')).rejects.toThrow(/literę/)
    })
})

describe('user-admin: happy path', () => {
    beforeEach(() => {
        loginAsSuperAdmin()
    })

    it('sendPasswordResetLink calls resetPasswordForEmail and logs audit', async () => {
        const { sendPasswordResetLink } = await import('../user-admin')
        await sendPasswordResetLink('target-1')

        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
            'target@b2b.pl',
            expect.any(Object)
        )
        expect(mockLogAudit).toHaveBeenCalledWith('super-1', 'PASSWORD_RESET', expect.objectContaining({
            target_user_id: 'target-1',
            target_email: 'target@b2b.pl',
            method: 'send_link',
        }))
    })

    it('sendPasswordResetLink translates rate-limit error to friendly message', async () => {
        mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Email rate limit exceeded', status: 429 } })
        const { sendPasswordResetLink } = await import('../user-admin')
        await expect(sendPasswordResetLink('target-1')).rejects.toThrow(/Limit emaili/)
    })

    it('forceSetPassword updates user, revokes sessions, and logs audit', async () => {
        const { forceSetPassword } = await import('../user-admin')
        await forceSetPassword('target-1', 'StrongPass1')

        expect(mockUpdateUserById).toHaveBeenCalledWith('target-1', { password: 'StrongPass1' })
        expect(mockRpc).toHaveBeenCalledWith('admin_revoke_user_sessions', { target_user_id: 'target-1' })
        expect(mockLogAudit).toHaveBeenCalledWith('super-1', 'PASSWORD_RESET', expect.objectContaining({
            method: 'force_set',
            sessions_invalidated: true,
        }))
    })

    it('signOutAllSessions calls revoke RPC and logs audit', async () => {
        const { signOutAllSessions } = await import('../user-admin')
        await signOutAllSessions('target-1')

        expect(mockRpc).toHaveBeenCalledWith('admin_revoke_user_sessions', { target_user_id: 'target-1' })
        expect(mockLogAudit).toHaveBeenCalledWith('super-1', 'PASSWORD_RESET', expect.objectContaining({
            method: 'sign_out_only',
        }))
    })

    it('setUserBan(true) sets long ban_duration and logs BLOCK_USER', async () => {
        const { setUserBan } = await import('../user-admin')
        await setUserBan('target-1', true)

        expect(mockUpdateUserById).toHaveBeenCalledWith('target-1', expect.objectContaining({
            ban_duration: expect.stringMatching(/h$/),
        }))
        expect(mockLogAudit).toHaveBeenCalledWith('super-1', 'BLOCK_USER', expect.any(Object))
    })

    it('setUserBan(false) sets ban_duration to "none" and logs UNBLOCK_USER', async () => {
        const { setUserBan } = await import('../user-admin')
        await setUserBan('target-1', false)

        expect(mockUpdateUserById).toHaveBeenCalledWith('target-1', { ban_duration: 'none' })
        expect(mockLogAudit).toHaveBeenCalledWith('super-1', 'UNBLOCK_USER', expect.any(Object))
    })

    it('listAllUsers returns mapped items with is_super_admin flag', async () => {
        mockListUsers.mockResolvedValue({
            data: {
                users: [
                    { id: 'u1', email: 'user1@b2b.pl', created_at: '2025-01-01', last_sign_in_at: null },
                    { id: 'super-1', email: SUPER_ADMINS[0], created_at: '2025-01-01', last_sign_in_at: '2025-05-01' },
                ],
                total: 2,
            },
            error: null,
        })
        const { listAllUsers } = await import('../user-admin')
        const result = await listAllUsers({ page: 1, limit: 50 })

        expect(result.items).toHaveLength(2)
        expect(result.items[0].is_super_admin).toBe(false)
        expect(result.items[1].is_super_admin).toBe(true)
        expect(result.items[0].has_logged_in).toBe(false)
        expect(result.items[1].has_logged_in).toBe(true)
    })
})

// ─── setUserRole ↔ admin_access_list ─────────────────────────────────────────
// Rola `admin` jest wyprowadzana przy loginie z `admin_access_list`, nie z
// `profiles.role` — sam UPDATE na profilu cofa się przy następnym logowaniu
// (a przy odbieraniu admina wpis na liście przywraca rolę). Te testy pilnują,
// że obie strony zawsze idą w parze.

describe('user-admin: setUserRole ↔ admin_access_list', () => {
    beforeEach(() => {
        loginAsSuperAdmin()
    })

    it('throws when caller is not super admin', async () => {
        loginAsRegularUser()
        const { setUserRole } = await import('../user-admin')
        await expect(setUserRole('target-1', 'admin')).rejects.toThrow(/Super Admina/)
    })

    it('rejects an unknown role', async () => {
        const { setUserRole } = await import('../user-admin')
        await expect(
            setUserRole('target-1', 'root' as unknown as 'admin')
        ).rejects.toThrow(/Nieprawidłowa rola/)
    })

    it('promoting to admin adds the email to admin_access_list', async () => {
        const { setUserRole } = await import('../user-admin')
        await setUserRole('target-1', 'admin')

        expect(mockAdminListUpsert).toHaveBeenCalledWith(
            { email: 'target@b2b.pl', added_by: 'super-1' },
            expect.objectContaining({ onConflict: 'email' })
        )
        expect(mockProfilesUpdate).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }))
        expect(mockLogAudit).toHaveBeenCalledWith(
            'super-1',
            'ROLE_CHANGE',
            expect.objectContaining({ new_role: 'admin', admin_access_list: 'granted' })
        )
    })

    it('lowercases the email written to the list', async () => {
        mockGetUserById.mockResolvedValue({
            data: { user: { id: 'target-1', email: 'Target@B2B.pl' } },
            error: null,
        })
        const { setUserRole } = await import('../user-admin')
        await setUserRole('target-1', 'admin')

        expect(mockAdminListUpsert).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'target@b2b.pl' }),
            expect.anything()
        )
    })

    it('demoting an admin removes the email from admin_access_list', async () => {
        mockProfilesSelectSingle.mockResolvedValue({
            data: { role: 'admin', full_name: 'Target User' },
            error: null,
        })
        const { setUserRole } = await import('../user-admin')
        await setUserRole('target-1', 'internal')

        expect(mockAdminListDeleteEq).toHaveBeenCalledWith('email', 'target@b2b.pl')
        expect(mockAdminListUpsert).not.toHaveBeenCalled()
        expect(mockProfilesUpdate).toHaveBeenCalledWith(expect.objectContaining({ role: 'internal' }))
        expect(mockLogAudit).toHaveBeenCalledWith(
            'super-1',
            'ROLE_CHANGE',
            expect.objectContaining({ admin_access_list: 'revoked' })
        )
    })

    it('leaves the list alone when the change does not cross the admin boundary', async () => {
        mockProfilesSelectSingle.mockResolvedValue({
            data: { role: 'internal', full_name: 'Target User' },
            error: null,
        })
        const { setUserRole } = await import('../user-admin')
        await setUserRole('target-1', 'finanse')

        expect(mockAdminListUpsert).not.toHaveBeenCalled()
        expect(mockAdminListDeleteEq).not.toHaveBeenCalled()
        expect(mockLogAudit).toHaveBeenCalledWith(
            'super-1',
            'ROLE_CHANGE',
            expect.objectContaining({ admin_access_list: 'unchanged' })
        )
    })

    it('does nothing when the role is unchanged', async () => {
        mockProfilesSelectSingle.mockResolvedValue({
            data: { role: 'admin', full_name: 'Target User' },
            error: null,
        })
        const { setUserRole } = await import('../user-admin')
        await setUserRole('target-1', 'admin')

        expect(mockAdminListUpsert).not.toHaveBeenCalled()
        expect(mockAdminListDeleteEq).not.toHaveBeenCalled()
        expect(mockProfilesUpdate).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('does not touch profiles when the list write fails', async () => {
        mockAdminListUpsert.mockResolvedValue({ error: { message: 'permission denied' } })
        const { setUserRole } = await import('../user-admin')

        await expect(setUserRole('target-1', 'admin')).rejects.toThrow(/listy administratorów/)
        expect(mockProfilesUpdate).not.toHaveBeenCalled()
    })

    it('reverts the list grant when the profiles update fails', async () => {
        mockProfilesUpdateEq.mockResolvedValue({ error: { message: 'db down' } })
        const { setUserRole } = await import('../user-admin')

        await expect(setUserRole('target-1', 'admin')).rejects.toThrow(/db down/)
        // Bez kompensacji nieudana operacja nadałaby admina przy następnym loginie.
        expect(mockAdminListDeleteEq).toHaveBeenCalledWith('email', 'target@b2b.pl')
    })

    it('reverts the list revocation when the profiles update fails', async () => {
        mockProfilesSelectSingle.mockResolvedValue({
            data: { role: 'admin', full_name: 'Target User' },
            error: null,
        })
        mockProfilesUpdateEq.mockResolvedValue({ error: { message: 'db down' } })
        const { setUserRole } = await import('../user-admin')

        await expect(setUserRole('target-1', 'internal')).rejects.toThrow(/db down/)
        expect(mockAdminListUpsert).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'target@b2b.pl' }),
            expect.anything()
        )
    })

    it('warns explicitly when the compensating revert also fails', async () => {
        mockProfilesUpdateEq.mockResolvedValue({ error: { message: 'db down' } })
        mockAdminListDeleteEq.mockResolvedValue({ error: { message: 'still down' } })
        const { setUserRole } = await import('../user-admin')

        await expect(setUserRole('target-1', 'admin')).rejects.toThrow(/nie udało się jej cofnąć/)
    })

    it('refuses to cross the admin boundary for an account without email', async () => {
        mockGetUserById.mockResolvedValue({
            data: { user: { id: 'target-1', email: null } },
            error: null,
        })
        const { setUserRole } = await import('../user-admin')

        await expect(setUserRole('target-1', 'admin')).rejects.toThrow(/bez adresu email/)
        expect(mockAdminListUpsert).not.toHaveBeenCalled()
        expect(mockProfilesUpdate).not.toHaveBeenCalled()
    })
})
