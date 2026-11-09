import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { bindLearnerToRuns } from '../learner-entry'

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

const client = (result: { data?: unknown; error?: { code: string; message: string } | null }) => ({ rpc: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }) }) as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> }

describe('bindLearnerToRuns', () => {
    beforeEach(() => vi.clearAllMocks())
    it('binds the account named by the claimed pass', async () => {
        const db = client({ data: { linked: 1, confirmed: 1, attendance: 1, failed: 0 } })
        await bindLearnerToRuns(db, 'account', 'user')
        expect(db.rpc).toHaveBeenCalledWith('academy_bind_learner_on_entry', { p_account_id: 'account', p_user_id: 'user' })
        expect(logger.error).not.toHaveBeenCalled()
    })
    it('stays silent before the migration', async () => {
        await expect(bindLearnerToRuns(client({ error: { code: 'PGRST202', message: 'x' } }), 'a', 'u')).resolves.toBeUndefined()
        expect(logger.error).not.toHaveBeenCalled()
    })
    it('logs a database failure without blocking the entry', async () => {
        await expect(bindLearnerToRuns(client({ error: { code: '500', message: 'x' } }), 'a', 'u')).resolves.toBeUndefined()
        expect(logger.error).toHaveBeenCalledWith({ event: 'academy.learner_entry.bind_failed', code: '500' })
    })
    it('does not block the entry when the call itself throws', async () => {
        const db = { rpc: vi.fn().mockRejectedValue(new Error('network')) } as unknown as SupabaseClient
        await expect(bindLearnerToRuns(db, 'a', 'u')).resolves.toBeUndefined()
        expect(logger.error).toHaveBeenCalledWith({ event: 'academy.learner_entry.bind_failed', code: undefined })
    })
    it('reports an edition that could not be processed', async () => {
        await bindLearnerToRuns(client({ data: { linked: 1, confirmed: 0, attendance: 0, failed: 2 } }), 'a', 'u')
        expect(logger.error).toHaveBeenCalledWith({ event: 'academy.learner_entry.bind_partial', failed: 2 })
    })
})
