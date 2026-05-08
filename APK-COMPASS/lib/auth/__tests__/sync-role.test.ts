import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/super-admins', () => ({
    isSuperAdmin: vi.fn(),
}))

import { syncRole } from '../sync-role'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockedIsSuperAdmin = vi.mocked(isSuperAdmin)

interface MockSupabase {
    client: SupabaseClient
    fromCalls: string[]
    updatePayloads: unknown[]
    updateEqCalls: Array<[string, string]>
    setAdminEntry: (entry: { id: string } | null) => void
}

function buildMockSupabase(): MockSupabase {
    const fromCalls: string[] = []
    const updatePayloads: unknown[] = []
    const updateEqCalls: Array<[string, string]> = []
    let adminEntry: { id: string } | null = null

    const client = {
        from: vi.fn((table: string) => {
            fromCalls.push(table)
            if (table === 'admin_access_list') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: adminEntry, error: null })),
                        })),
                    })),
                }
            }
            if (table === 'profiles') {
                return {
                    update: vi.fn((payload: unknown) => {
                        updatePayloads.push(payload)
                        return {
                            eq: vi.fn(async (column: string, value: string) => {
                                updateEqCalls.push([column, value])
                                return { data: null, error: null }
                            }),
                        }
                    }),
                }
            }
            throw new Error(`unexpected table: ${table}`)
        }),
    } as unknown as SupabaseClient

    return {
        client,
        fromCalls,
        updatePayloads,
        updateEqCalls,
        setAdminEntry: (entry) => {
            adminEntry = entry
        },
    }
}

describe('syncRole', () => {
    beforeEach(() => {
        mockedIsSuperAdmin.mockReset()
    })

    it('promotes super-admin email from consultant to admin', async () => {
        mockedIsSuperAdmin.mockReturnValue(true)
        const m = buildMockSupabase()

        const result = await syncRole(m.client, 'user-1', 'super@b2bnetwork.pl', 'consultant')

        expect(result).toBe('admin')
        expect(m.updatePayloads).toEqual([{ role: 'admin' }])
        expect(m.updateEqCalls).toEqual([['id', 'user-1']])
    })

    it('keeps existing admin (in admin_access_list) without writing', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setAdminEntry({ id: 'access-1' })

        const result = await syncRole(m.client, 'user-2', 'admin@b2bnetwork.pl', 'admin')

        expect(result).toBe('admin')
        expect(m.updatePayloads).toEqual([])
        expect(m.fromCalls).toContain('admin_access_list')
        expect(m.fromCalls).not.toContain('profiles')
    })

    it('preserves internal role for non-admin user (regression: Phase 11a fix)', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setAdminEntry(null)

        const result = await syncRole(m.client, 'user-3', 'olaf@b2bnetwork.pl', 'internal')

        expect(result).toBe('internal')
        expect(m.updatePayloads).toEqual([])
        expect(m.fromCalls).not.toContain('profiles')
    })

    it('keeps consultant unchanged for non-admin user', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setAdminEntry(null)

        const result = await syncRole(m.client, 'user-4', 'consultant@b2bnetwork.pl', 'consultant')

        expect(result).toBe('consultant')
        expect(m.updatePayloads).toEqual([])
    })

    it('demotes ex-admin to consultant when removed from admin_access_list', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setAdminEntry(null)

        const result = await syncRole(m.client, 'user-5', 'ex-admin@b2bnetwork.pl', 'admin')

        expect(result).toBe('consultant')
        expect(m.updatePayloads).toEqual([{ role: 'consultant' }])
        expect(m.updateEqCalls).toEqual([['id', 'user-5']])
    })

    it('admin promotion overrides internal role', async () => {
        mockedIsSuperAdmin.mockReturnValue(true)
        const m = buildMockSupabase()

        const result = await syncRole(m.client, 'user-6', 'super@b2bnetwork.pl', 'internal')

        expect(result).toBe('admin')
        expect(m.updatePayloads).toEqual([{ role: 'admin' }])
    })

    it('lowercases email before checking admin_access_list', async () => {
        mockedIsSuperAdmin.mockReturnValue(false)
        const m = buildMockSupabase()
        m.setAdminEntry(null)
        const eqSpy = vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        }))
        const selectSpy = vi.fn(() => ({ eq: eqSpy }))
        ;(m.client.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
            if (table === 'admin_access_list') {
                return { select: selectSpy }
            }
            return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })) }
        })

        await syncRole(m.client, 'user-7', 'OLAF@B2BNETWORK.PL', 'consultant')

        expect(mockedIsSuperAdmin).toHaveBeenCalledWith('olaf@b2bnetwork.pl')
        expect(eqSpy).toHaveBeenCalledWith('email', 'olaf@b2bnetwork.pl')
    })
})
