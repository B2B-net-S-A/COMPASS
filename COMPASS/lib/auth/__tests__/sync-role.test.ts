import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/super-admins', () => ({
    isSuperAdmin: vi.fn(),
}))

// Audyt 2026-08: syncRole tworzy klienta service-role SAM (patrz komentarz
// w lib/auth/sync-role.ts). Test musi więc mockować fabrykę, a nie wstrzykiwać
// klienta — inaczej przechodziłby, mimo że produkcyjna ścieżka woła RPC
// kluczem użytkownika, któremu migracja odbiera EXECUTE.
vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: vi.fn(),
}))

import { syncRole } from '../sync-role'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import { createServiceClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockedIsSuperAdmin = vi.mocked(isSuperAdmin)
const mockedCreateServiceClient = vi.mocked(createServiceClient)

// Phase 18.3: syncRole jest teraz cienkim wrapperem nad RPC `sync_user_role`
// (atomic w bazie). Mockujemy `supabase.rpc()` zamiast od skomplikowanego
// łańcucha `from().select().eq().maybeSingle()` i `from().update().eq()`.

interface MockSupabase {
    client: SupabaseClient
    rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>
    setRpcReturn: (returnValue: unknown, error?: { message: string } | null) => void
}

function buildMockSupabase(): MockSupabase {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
    let nextReturn: unknown = 'consultant'
    let nextError: { message: string } | null = null

    const client = {
        rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
            rpcCalls.push({ fn, args })
            return { data: nextReturn, error: nextError }
        }),
    } as unknown as SupabaseClient

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
        mockedCreateServiceClient.mockReset()
    })

    it('calls sync_user_role RPC with super-admin flag', async () => {
        mockedIsSuperAdmin.mockReturnValue(true)
        const m = buildMockSupabase()
        m.setRpcReturn('admin')

        mockedCreateServiceClient.mockReturnValue(m.client as never)

        const result = await syncRole('user-1', 'super@b2bnetwork.pl', 'consultant')

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
        const m = buildMockSupabase()
        m.setRpcReturn('admin')

        mockedCreateServiceClient.mockReturnValue(m.client as never)

        const result = await syncRole('user-2', 'admin@b2bnetwork.pl', 'admin')

        expect(result).toBe('admin')
        expect(m.rpcCalls[0].args).toEqual({
            p_user_id: 'user-2',
            p_email: 'admin@b2bnetwork.pl',
            p_is_super_admin: false,
        })
    })

    it('returns whatever the RPC returns (internal preserved)', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setRpcReturn('internal')

        mockedCreateServiceClient.mockReturnValue(m.client as never)

        const result = await syncRole('user-3', 'olaf@b2bnetwork.pl', 'internal')

        expect(result).toBe('internal')
    })

    it('lowercases email before passing to RPC', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setRpcReturn('consultant')

        mockedCreateServiceClient.mockReturnValue(m.client as never)

        await syncRole('user-4', 'OLAF@B2BNETWORK.PL', 'consultant')

        expect(mockedIsSuperAdmin).toHaveBeenCalledWith('olaf@b2bnetwork.pl')
        expect(m.rpcCalls[0].args.p_email).toBe('olaf@b2bnetwork.pl')
    })

    it('throws if RPC fails (fail closed)', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setRpcReturn(null, { message: 'profile not found' })

        mockedCreateServiceClient.mockReturnValue(m.client as never)

        await expect(syncRole('user-5', 'missing@b2bnetwork.pl', 'consultant'))
            .rejects.toThrow('sync_user_role failed: profile not found')
    })

    it('atomic: single RPC call replaces 2-step SELECT+UPDATE flow', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setRpcReturn('consultant')

        mockedCreateServiceClient.mockReturnValue(m.client as never)

        await syncRole('user-6', 'consultant@b2bnetwork.pl', 'consultant')

        // Tylko 1 call do bazy, nie 2. Atomiczność po stronie Postgresa.
        expect(m.rpcCalls).toHaveLength(1)
    })
})
