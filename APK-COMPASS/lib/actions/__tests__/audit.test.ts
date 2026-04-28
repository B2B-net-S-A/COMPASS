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

describe('logAudit', () => {
    it('writes a row with action + userId + ip_address (default "unknown" without x-forwarded-for)', async () => {
        setup({ tables: { audit_logs: [] } })
        const { logAudit } = await import('../audit')
        await logAudit('u1', 'LOGIN', { foo: 'bar' })
        const row = currentClient._tables.audit_logs[0]
        expect(row.user_id).toBe('u1')
        expect(row.action).toBe('LOGIN')
        expect(row.details).toEqual({ foo: 'bar' })
        expect(row.ip_address).toBe('unknown')
    })

    it('accepts null userId (e.g. failed login before identification)', async () => {
        setup({ tables: { audit_logs: [] } })
        const { logAudit } = await import('../audit')
        await logAudit(null, 'LOGIN_FAILED', { email: 'x@y.com' })
        expect(currentClient._tables.audit_logs[0].user_id).toBeNull()
    })

    it('does not throw when supabase write fails — only logs to console.error', async () => {
        // Force an insert error by making the table read-only via overriding from()
        const client = createMockSupabaseClient({})
        client.from = vi.fn(() => ({
            insert: vi.fn(async () => ({ error: { message: 'boom' } })),
        })) as unknown as typeof client.from
        currentClient = client
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { logAudit } = await import('../audit')
        await expect(logAudit('u1', 'LOGIN')).resolves.toBeUndefined()
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it('supports the full set of audit actions (type-level discrimination)', async () => {
        setup({ tables: { audit_logs: [] } })
        const { logAudit } = await import('../audit')
        const actions = ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'REGISTER', 'PASSWORD_RESET', 'ROLE_CHANGE', 'BLOCK_USER', 'UNBLOCK_USER', 'DELETE_USER', 'MFA_VERIFY', 'MFA_SENT'] as const
        for (const a of actions) {
            await logAudit('u1', a)
        }
        expect(currentClient._tables.audit_logs.map((r: any) => r.action)).toEqual([...actions])
    })
})
