import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasFilter, recorder, type RecordedQuery } from './fake-query-recorder'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const ctx = vi.hoisted(() => ({
    userId: 'tcm-1',
    email: 'tcm@b2bnetwork.pl',
    role: 'talent_community',
    isAdmin: false,
    isManager: false,
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireInternalOrAdminAction: async () => ctx,
    requireLifecycleManagerAction: async () => ctx,
}))
vi.mock('@/lib/supabase/lifecycle-client', async () => {
    const { recorder: r } = await import('./fake-query-recorder')
    return {
        createLifecycleClient: () => r.client,
        createLifecycleAdminClient: () => r.client,
    }
})
vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
    sendExitInterviewInvitation: vi.fn(async () => ({ success: true })),
    sendOffboardingChecklistToManager: vi.fn(async () => ({ success: true })),
    sendOnboardingWelcome: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/push/dispatch', () => ({ sendPushToUserId: vi.fn(async () => ({ success: true })) }))

import {
    completeOnboarding,
    completeOnboardingTask,
    restartOnboarding,
} from '@/lib/actions/lifecycle'

const writes = (table: string) =>
    recorder.calls.filter((c) => c.table === table && c.op !== 'select')

beforeEach(() => recorder.reset())
afterEach(() => vi.clearAllMocks())

// ─── HF-17 ──────────────────────────────────────────────────────────────────

describe('completeOnboarding — HF-17 (stara karta nie przywraca active)', () => {
    function resolverFor(progress: Record<string, unknown>, opts: { claimRows?: unknown[]; profileError?: string } = {}) {
        return (q: RecordedQuery) => {
            if (q.table === 'onboarding_tasks') {
                return { data: [{ is_required: true, completed_at: '2026-09-01', progress_id: 'p-1' }], error: null }
            }
            if (q.table === 'onboarding_progress' && q.op === 'select') {
                return { data: progress, error: null }
            }
            if (q.table === 'onboarding_progress' && q.op === 'update' && q.returning) {
                return { data: opts.claimRows ?? [{ id: 'p-1' }], error: null }
            }
            if (q.table === 'profiles' && q.op === 'update' && opts.profileError) {
                return { data: null, error: { message: opts.profileError } }
            }
            return undefined
        }
    }

    it('odrzuca anulowany onboarding i nie zmienia żadnego stanu', async () => {
        recorder.resolver = resolverFor({ user_id: 'emp-1', completed_at: null, cancelled_at: '2026-09-10' })

        await expect(completeOnboarding('p-1')).rejects.toThrow(/anulowany/i)

        expect(writes('onboarding_progress')).toHaveLength(0)
        expect(writes('profiles')).toHaveLength(0)
        expect(writes('lifecycle_events')).toHaveLength(0)
    })

    it('odrzuca już zakończony onboarding', async () => {
        recorder.resolver = resolverFor({ user_id: 'emp-1', completed_at: '2026-09-10', cancelled_at: null })

        await expect(completeOnboarding('p-1')).rejects.toThrow(/już zakończony/i)
        expect(writes('profiles')).toHaveLength(0)
    })

    it('przegrany wyścig (0 wierszy w warunkowym zapisie) → konflikt, profil nietknięty', async () => {
        recorder.resolver = resolverFor(
            { user_id: 'emp-1', completed_at: null, cancelled_at: null },
            { claimRows: [] },
        )

        await expect(completeOnboarding('p-1')).rejects.toThrow(/w międzyczasie/i)

        const claim = writes('onboarding_progress')[0]
        expect(hasFilter(claim, 'is', 'completed_at', null)).toBe(true)
        expect(hasFilter(claim, 'is', 'cancelled_at', null)).toBe(true)
        expect(writes('profiles')).toHaveLength(0)
    })

    it('szczęśliwa ścieżka: status zmienia się tylko z onboarding na active', async () => {
        recorder.resolver = resolverFor({ user_id: 'emp-1', completed_at: null, cancelled_at: null })

        await completeOnboarding('p-1')

        const profileUpdate = writes('profiles')[0]
        expect(profileUpdate.payload).toEqual({ employment_status: 'active' })
        expect(hasFilter(profileUpdate, 'eq', 'employment_status', 'onboarding')).toBe(true)
        expect(writes('lifecycle_events')).toHaveLength(1)
    })

    it('błąd zapisu profilu → cofnięcie zakończenia i błąd zamiast fałszywego sukcesu', async () => {
        recorder.resolver = resolverFor(
            { user_id: 'emp-1', completed_at: null, cancelled_at: null },
            { profileError: 'trigger rejected' },
        )

        await expect(completeOnboarding('p-1')).rejects.toThrow(/statusu pracownika/i)

        const progressWrites = writes('onboarding_progress')
        expect(progressWrites).toHaveLength(2)
        expect(progressWrites[1].payload).toEqual({ completed_at: null })
        expect(writes('lifecycle_events')).toHaveLength(0)
    })
})

// ─── HF-13 ──────────────────────────────────────────────────────────────────

describe('restartOnboarding — HF-13 (walidacja szablonu przed DELETE)', () => {
    function resolverFor(templateActive: boolean) {
        return (q: RecordedQuery) => {
            if (q.table === 'onboarding_progress' && q.op === 'select') {
                return {
                    data: { user_id: 'emp-1', template_id: 'tpl-old', cancelled_at: null, completed_at: null },
                    error: null,
                }
            }
            if (q.table === 'onboarding_templates') {
                return { data: templateActive ? { id: 'tpl-old' } : null, error: null }
            }
            if (q.table === 'rpc:start_onboarding_for_user') {
                return { data: 'p-new', error: null }
            }
            return undefined
        }
    }

    it('zarchiwizowany szablon: brak anulowania, brak DELETE, brak RPC', async () => {
        recorder.resolver = resolverFor(false)

        await expect(restartOnboarding('p-1')).rejects.toThrow(/zarchiwizowany/i)

        const templateCheck = recorder.find('onboarding_templates')[0]
        expect(hasFilter(templateCheck, 'eq', 'is_archived', false)).toBe(true)
        expect(writes('onboarding_progress')).toHaveLength(0)
        expect(recorder.find('rpc:start_onboarding_for_user')).toHaveLength(0)
    })

    it('aktywny szablon: anulowanie → DELETE → RPC z tym szablonem', async () => {
        recorder.resolver = resolverFor(true)

        const newId = await restartOnboarding('p-1')

        expect(newId).toBe('p-new')
        const ops = writes('onboarding_progress').map((w) => w.op)
        expect(ops).toEqual(['update', 'delete'])
        const rpc = recorder.find('rpc:start_onboarding_for_user')[0]
        expect(rpc.payload).toMatchObject({ p_user_id: 'emp-1', p_template_id: 'tpl-old' })
    })

    it('błąd anulowania przerywa restart przed DELETE', async () => {
        recorder.resolver = (q) => {
            if (q.table === 'onboarding_progress' && q.op === 'update') {
                return { data: null, error: { message: 'db down' } }
            }
            return resolverFor(true)(q)
        }

        await expect(restartOnboarding('p-1')).rejects.toThrow(/restart przerwany/i)
        expect(recorder.find('onboarding_progress', 'delete')).toHaveLength(0)
    })
})

// ─── HF-18 ──────────────────────────────────────────────────────────────────

describe('completeOnboardingTask — HF-18 (hash pliku zostaje)', () => {
    it('ponowne oznaczenie bez nowego pliku nie nadpisuje file_hash', async () => {
        recorder.resolver = (q) => {
            if (q.table === 'onboarding_tasks' && q.op === 'select') {
                return {
                    data: { id: 't-1', progress_id: 'p-1', requires_file: true, file_path: 'onboarding/emp-1/umowa.pdf' },
                    error: null,
                }
            }
            return undefined
        }
        const fd = new FormData()
        fd.set('taskId', 't-1')

        await completeOnboardingTask(fd)

        const update = recorder.find('onboarding_tasks', 'update')[0]
        expect(update.payload).toMatchObject({ file_path: 'onboarding/emp-1/umowa.pdf' })
        expect(update.payload).not.toHaveProperty('file_hash')
    })
})
