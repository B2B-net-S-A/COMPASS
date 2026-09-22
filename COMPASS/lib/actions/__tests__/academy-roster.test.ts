import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, ENROLLMENT, OTHER, RUN, USER } from './academy-fixtures'
import type { MockSupabase } from '@/test/mocks/supabase'
import type { AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import { listAcademyRunParticipants } from '../academy-sessions'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => { client = academyFixture() })

const participant: AcademyRunParticipantDTO = {
    registrationId: OTHER, userId: OTHER, enrollmentId: ENROLLMENT, fullName: 'Uczestnik', email: 'learner@example.test', status: 'confirmed',
    completedAt: '2026-09-01T10:00:00Z', completionState: 'revoked', completionRevokedAt: '2026-09-22T10:00:00Z', attendance: [],
    progress: { versionNumber: 1, totalLessons: 3, completedLessons: 1, lessonPercent: 33, requireAllLessons: true, quizRequired: true, quizPassPercent: 75, quizPassed: true, quizBestScorePercent: 75, quizAttemptCount: 2 },
}

describe('Academy scoped roster action', () => {
    it('uses one validated run-scoped RPC and preserves authoritative completion and pinned progress', async () => {
        client = academyFixture({ rpcs: { academy_run_participants: () => [participant] } })
        expect(await listAcademyRunParticipants(RUN)).toEqual({ success: true, data: [participant] })
        expect(client.rpc).toHaveBeenCalledWith('academy_run_participants', { p_run_id: RUN })
        expect(client.from).not.toHaveBeenCalledWith('course_enrollments')
        expect(client.from).not.toHaveBeenCalledWith('course_quiz_attempts')
    })
    it('rejects a malformed run identifier before the roster RPC', async () => {
        expect((await listAcademyRunParticipants('run-in-another-group')).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_run_participants', expect.anything())
    })
    it.each([
        { role: 'consultant', is_external: false, employment_status: 'exited' },
        { role: 'consultant', is_external: true, employment_status: 'active' },
        { role: 'internal', is_external: false, employment_status: 'active' },
    ])('does not read a roster for an ineligible profile %j', async profile => {
        client = academyFixture({ tables: { profiles: [{ id: USER, ...profile }] } })
        expect((await listAcademyRunParticipants(RUN)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_run_participants', expect.anything())
    })
    it('fails closed when the trainer capability was revoked', async () => {
        client = academyFixture({ tables: { academy_user_capabilities: [{ user_id: USER, can_train: true, revoked_at: '2026-09-22T10:00:00Z' }] } })
        expect((await listAcademyRunParticipants(RUN)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_run_participants', expect.anything())
    })
    it('respects rollout and authentication before invoking the scoped read', async () => {
        client = academyFixture({ rpcs: { academy_rollout_access: () => ({ allowed: false }) } })
        expect((await listAcademyRunParticipants(RUN)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_run_participants', expect.anything())
        client = academyFixture({ user: null })
        expect((await listAcademyRunParticipants(RUN)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalled()
    })
    it('preserves a database group-scope rejection as failure rather than an empty successful roster', async () => {
        client = academyFixture({ rpcs: { academy_run_participants: () => { throw new Error('Brak uprawnień do listy uczestników.') } } })
        const result = await listAcademyRunParticipants(RUN)
        expect(result.success).toBe(false)
        expect(result).toHaveProperty('error')
    })
    it('keeps an empty group as an empty list', async () => {
        client = academyFixture({ rpcs: { academy_run_participants: () => [] } })
        expect(await listAcademyRunParticipants(RUN)).toEqual({ success: true, data: [] })
    })
})
