import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase } from '@/test/mocks/supabase'

let sessionClient: MockSupabase
let serviceClient: MockSupabase

const guardContext = {
    userId: 'admin-1',
    email: 'admin@b2bnetwork.pl',
    role: 'admin',
    isAdmin: true,
}

vi.mock('@/lib/auth/internal-guard', () => ({
    requireInternalOrAdminAction: vi.fn(async () => guardContext),
    requireLifecycleManagerAction: vi.fn(async () => guardContext),
}))

vi.mock('@/lib/supabase/lifecycle-client', () => ({
    createLifecycleClient: () => sessionClient,
    createLifecycleAdminClient: () => serviceClient,
}))

vi.mock('@/lib/actions/audit', () => ({
    logAudit: vi.fn(async () => undefined),
}))

vi.mock('@/lib/email', () => ({
    sendExitInterviewInvitation: vi.fn(async () => ({ success: true })),
    sendOffboardingChecklistToManager: vi.fn(async () => ({ success: true })),
    sendOnboardingWelcome: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/actions/push-subscriptions', () => ({
    sendPushToUserId: vi.fn(async () => ({ success: true })),
}))

beforeEach(() => {
    const now = new Date().toISOString()
    sessionClient = createMockSupabaseClient({
        tables: {
            onboarding_progress: [{
                id: 'progress-1',
                user_id: 'user-1',
                started_at: now,
                completed_at: null,
                tasks: [
                    { id: 'task-1', completed_at: now, due_date: now },
                    { id: 'task-2', completed_at: null, due_date: '2020-01-01T00:00:00.000Z' },
                ],
            }],
            lifecycle_notes: [{
                id: 'note-1',
                user_id: 'user-1',
                author_id: 'admin-1',
                category: 'general',
                content: 'Follow up',
                is_private: false,
                created_at: now,
                updated_at: now,
            }],
            profile_directory: [{ id: 'admin-1', full_name: 'Admin One' }],
        },
    })
    serviceClient = createMockSupabaseClient({
        tables: {
            profiles: [
                {
                    id: 'user-1',
                    full_name: 'User One',
                    email: 'user@b2bnetwork.pl',
                    role: 'internal',
                    hired_at: '2026-01-01',
                    employment_status: 'active',
                    buddy_id: 'buddy-1',
                },
                {
                    id: 'admin-1',
                    full_name: 'Admin One',
                    email: 'admin@b2bnetwork.pl',
                    role: 'admin',
                    employment_status: 'active',
                },
            ],
            onboarding_progress: [{
                id: 'completed-1',
                user_id: 'user-1',
                started_at: '2026-01-01T00:00:00.000Z',
                completed_at: now,
                cancelled_at: null,
                cancellation_reason: null,
                user: {
                    full_name: 'User One',
                    email: 'user@b2bnetwork.pl',
                    role: 'internal',
                },
            }],
            onboarding_tasks: [],
            exit_interviews: [{
                id: 'exit-1',
                user_id: 'user-1',
                status: 'submitted',
                created_at: now,
                submitted_at: now,
                nps_score: 9,
                exit_reason: 'other',
                role_snapshot: 'internal',
                user: { full_name: 'User One', email: 'user@b2bnetwork.pl' },
            }],
        },
        rpcs: {
            record_lifecycle_event: () => null,
        },
    })
})

describe('C2 lifecycle profile access', () => {
    it('keeps onboarding row visibility on the session client and hydrates visible profiles server-side', async () => {
        const { listOnboardingQueue } = await import('../lifecycle')

        const result = await listOnboardingQueue()

        expect(result).toEqual([expect.objectContaining({
            progress_id: 'progress-1',
            user_id: 'user-1',
            full_name: 'User One',
            email: 'user@b2bnetwork.pl',
            role: 'internal',
            tasks_total: 2,
            tasks_completed: 1,
            tasks_overdue: 1,
        })])
        expect(sessionClient.from).toHaveBeenCalledWith('onboarding_progress')
        expect(serviceClient.from).toHaveBeenCalledWith('profiles')
    })

    it('hydrates lifecycle note authors from profile_directory after note RLS', async () => {
        const { listLifecycleNotes } = await import('../lifecycle')

        const result = await listLifecycleNotes('user-1')

        expect(result).toEqual([expect.objectContaining({
            id: 'note-1',
            author_id: 'admin-1',
            author_name: 'Admin One',
        })])
        expect(sessionClient.from).toHaveBeenCalledWith('lifecycle_notes')
        expect(sessionClient.from).toHaveBeenCalledWith('profile_directory')
    })

    it('uses the guarded service client for lifecycle manager cross-user actions', async () => {
        const {
            assignBuddy,
            getLifecycleAnalytics,
            listCompletedOnboardings,
            listExitInterviews,
        } = await import('../lifecycle')

        await assignBuddy('user-1', null)
        expect(serviceClient._tables.profiles[0].buddy_id).toBeNull()

        expect(await listExitInterviews()).toEqual([
            expect.objectContaining({
                id: 'exit-1',
                user_full_name: 'User One',
                user_email: 'user@b2bnetwork.pl',
            }),
        ])
        expect(await getLifecycleAnalytics()).toEqual(expect.objectContaining({
            activeOnboardings: expect.any(Number),
            retentionByRole: expect.any(Array),
        }))
        expect(await listCompletedOnboardings()).toEqual(expect.any(Array))
    })
})
