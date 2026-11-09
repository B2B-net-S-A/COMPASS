import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { readCockpitOutbox, readCockpitQuestions } from '../edition-cockpit-server'

type Response = { data: unknown; error: { code?: string; message: string } | null }
function client(pages: Response[]) {
    let call = 0
    const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, order: () => chain,
        range: async () => pages[call++],
        then: (resolve: (value: Response) => unknown) => Promise.resolve(resolve(pages[call++])),
    }
    return { from: () => chain } as unknown as SupabaseClient
}

describe('readCockpitOutbox', () => {
    it('collects every page', async () => {
        const full = Array.from({ length: 1000 }, () => ({ kind: 'k', status: 'held', dedupe_key: 'x' }))
        await expect(readCockpitOutbox(client([{ data: full, error: null }, { data: [full[0]], error: null }]), 'r')).resolves.toHaveLength(1001)
    })

    it('reports an unmigrated queue as unavailable, not empty', async () => {
        await expect(readCockpitOutbox(client([{ data: null, error: { code: '42P01', message: 'x' } }]), 'r')).resolves.toBeNull()
    })

    it('reports a denied read as unavailable, not empty', async () => {
        await expect(readCockpitOutbox(client([{ data: null, error: { code: '42501', message: 'x' } }]), 'r')).resolves.toBeNull()
    })
})

describe('readCockpitQuestions', () => {
    it('leaves voided questions out of both counts', async () => {
        const data = [{ pool_status: 'approved', voided_at: null }, { pool_status: 'approved', voided_at: 'x' }, { pool_status: 'draft', voided_at: null }]
        await expect(readCockpitQuestions(client([{ data, error: null }]), 'v')).resolves.toEqual({ approved: 1, draft: 1 })
    })

    it('degrades when the pool columns do not exist yet', async () => {
        await expect(readCockpitQuestions(client([{ data: null, error: { code: '42703', message: 'x' } }]), 'v')).resolves.toBeNull()
    })
})
