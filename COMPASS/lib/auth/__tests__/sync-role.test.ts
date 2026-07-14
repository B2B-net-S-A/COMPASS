import { beforeEach, describe, expect, it, vi } from 'vitest'

const { serviceRpc } = vi.hoisted(() => ({
    serviceRpc: vi.fn(),
}))

vi.mock('@/lib/auth/super-admins', () => ({
    isSuperAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({ rpc: serviceRpc }),
}))

import { syncRole } from '../sync-role'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockedIsSuperAdmin = vi.mocked(isSuperAdmin)

// Phase 18.3: syncRole jest teraz cienkim wrapperem nad RPC `sync_user_role`
// (atomic w bazie). Mockujemy `supabase.rpc()` zamiast od skomplikowanego
// łańcucha `from().select().eq().maybeSingle()` i `from().update().eq()`.

interface MockSupabase {
    client: SupabaseClient
    rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>
    setRpcReturn: (returnValue: unknown, error?: { message: string } | null) => void
}

function buildMockSupabase(userId: string, email: string): MockSupabase {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
    let nextReturn: unknown = 'consultant'
    let nextError: { message: string } | null = null

    const client = {
        auth: {
            getUser: vi.fn(async () => ({
                data: { user: { id: userId, email } },
                error: null,
            })),
        },
    } as unknown as SupabaseClient

    serviceRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args })
        return { data: nextReturn, error: nextError }
    })

    return {
        client,
        rpcCalls,
        setRpcReturn: (returnValue, error = null) => {
            nextReturn = returnValue
            nextError = error
        },
    }
}

describe('syncRole', () => {
    beforeEach(() => {
        mockedIsSuperAdmin.mockReset()
        serviceRpc.mockReset()
    })

    it('calls sync_user_role RPC with super-admin flag', async () => {
        mockedIsSuperAdmin.mockReturnValue(true)
        const m = buildMockSupabase('user-1', 'super@b2bnetwork.pl')
        m.setRpcReturn('admin')

        const result = await syncRole(m.client, 'user-1', 'super@b2bnetwork.pl', 'consultant')

        expect(result).toBe('admin')
        expect(m.rpcCalls).toHaveLength(1)
        expect(m.rpcCalls[0]).toEqual({
            fn: 'sync_user_role',
            args: {
                p_user_id: 'user-1',
                p_email: 'super@b2bnetwork.pl',
                p_is_super_admin: true,
            },
        })
    })

    it('calls RPC with super-admin=false for non-super-admin', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase('user-2', 'admin@b2bnetwork.pl')
        m.setRpcReturn('admin')

        const result = await syncRole(m.client, 'user-2', 'admin@b2bnetwork.pl', 'admin')

        expect(result).toBe('admin')
        expect(m.rpcCalls[0].args).toEqual({
            p_user_id: 'user-2',
            p_email: 'admin@b2bnetwork.pl',
            p_is_super_admin: false,
        })
    })

    it('returns whatever the RPC returns (internal preserved)', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase('user-3', 'olaf@b2bnetwork.pl')
        m.setRpcReturn('internal')

        const result = await syncRole(m.client, 'user-3', 'olaf@b2bnetwork.pl', 'internal')

        expect(result).toBe('internal')
    })

    it('lowercases email before passing to RPC', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase('user-4', 'olaf@b2bnetwork.pl')
        m.setRpcReturn('consultant')

        await syncRole(m.client, 'user-4', 'OLAF@B2BNETWORK.PL', 'consultant')

        expect(mockedIsSuperAdmin).toHaveBeenCalledWith('olaf@b2bnetwork.pl')
        expect(m.rpcCalls[0].args.p_email).toBe('olaf@b2bnetwork.pl')
    })

    it('throws if RPC fails (fail closed)', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase('user-5', 'missing@b2bnetwork.pl')
        m.setRpcReturn(null, { message: 'profile not found' })

        await expect(syncRole(m.client, 'user-5', 'missing@b2bnetwork.pl', 'consultant'))
            .rejects.toThrow('sync_user_role failed: profile not found')
    })

    it('atomic: single RPC call replaces 2-step SELECT+UPDATE flow', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase('user-6', 'consultant@b2bnetwork.pl')
        m.setRpcReturn('consultant')

        await syncRole(m.client, 'user-6', 'consultant@b2bnetwork.pl', 'consultant')

        // Tylko 1 call do bazy, nie 2. Atomiczność po stronie Postgresa.
        expect(m.rpcCalls).toHaveLength(1)
    })

    it('fails closed before service RPC when verified user id differs', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase('attacker', 'user@b2bnetwork.pl')

        await expect(syncRole(m.client, 'victim', 'user@b2bnetwork.pl', 'consultant'))
            .rejects.toThrow('sync_user_role failed: verified user mismatch')
        expect(m.rpcCalls).toHaveLength(0)
    })

    it('fails closed before service RPC when verified email differs', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase('user-7', 'attacker@b2bnetwork.pl')

        await expect(syncRole(m.client, 'user-7', 'victim@b2bnetwork.pl', 'consultant'))
            .rejects.toThrow('sync_user_role failed: verified user mismatch')
        expect(m.rpcCalls).toHaveLength(0)
    })
})
