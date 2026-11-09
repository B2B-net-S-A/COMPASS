import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { fetchDisplayNames } from '../display-names'

const person = { id: 'u1', full_name: 'Anna Nowak', avatar_url: 'a.png' }

function clientWith(
    rpcResult: { data: unknown; error: unknown },
    readResult: { data: unknown; error: unknown } = { data: [], error: null },
) {
    const inFn = vi.fn().mockResolvedValue(readResult)
    const select = vi.fn(() => ({ in: inFn }))
    const from = vi.fn(() => ({ select }))
    const rpc = vi.fn().mockResolvedValue(rpcResult)
    return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, inFn }
}

describe('fetchDisplayNames', () => {
    beforeEach(() => vi.clearAllMocks())

    it('nie woła bazy dla pustej listy', async () => {
        const { client, rpc, from } = clientWith({ data: [], error: null })

        const result = await fetchDisplayNames(client, [])

        expect(result.size).toBe(0)
        expect(rpc).not.toHaveBeenCalled()
        expect(from).not.toHaveBeenCalled()
    })

    it('czyta przez RPC i usuwa duplikaty identyfikatorów', async () => {
        const { client, rpc, from } = clientWith({ data: [person], error: null })

        const result = await fetchDisplayNames(client, ['u1', 'u1'])

        expect(rpc).toHaveBeenCalledWith('people_display_names', { p_user_ids: ['u1'] })
        expect(from).not.toHaveBeenCalled()
        expect(result.get('u1')).toEqual({ full_name: 'Anna Nowak', avatar_url: 'a.png' })
    })

    it('przed migracją wraca do odczytu profiles', async () => {
        const { client, from, inFn } = clientWith(
            { data: null, error: { code: 'PGRST202' } },
            { data: [person], error: null },
        )

        const result = await fetchDisplayNames(client, ['u1'])

        expect(from).toHaveBeenCalledWith('profiles')
        expect(inFn).toHaveBeenCalledWith('id', ['u1'])
        expect(result.get('u1')?.full_name).toBe('Anna Nowak')
    })

    it('awaria obu odczytów daje pustą mapę zamiast wyjątku', async () => {
        const { client } = clientWith(
            { data: null, error: { code: 'PGRST202' } },
            { data: null, error: { code: '500' } },
        )

        await expect(fetchDisplayNames(client, ['u1'])).resolves.toEqual(new Map())
    })

    it('osoba spoza wyniku RPC po prostu nie ma etykiety', async () => {
        const { client } = clientWith({ data: [person], error: null })

        const result = await fetchDisplayNames(client, ['u1', 'obcy'])

        expect(result.has('obcy')).toBe(false)
    })
})
