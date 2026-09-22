import { describe, expect, it, vi } from 'vitest'
import { AcademyIntegrationError } from '../teams'
import { runAcademyIntegrationBatch, type AcademyIntegrationJob, type AcademyIntegrationPorts, type AcademyIntegrationSession, type AcademyTeamsAdapter } from '../integration-worker'

const job: AcademyIntegrationJob = { id: 'job', sessionId: 'session', revision: 2, kind: 'sync_meeting', attempt: 1, leaseToken: 'lease' }
const session: AcademyIntegrationSession = {
    id: 'session', revision: 2, approved: true, published: true, cancelled: false, mode: 'managed_teams', meeting: null,
    input: { sessionId: 'session', organizer: { tenantId: 'tenant', userId: 'organizer' }, subject: 'Kurs', startDateTime: '2026-09-22T08:00:00Z', endDateTime: '2026-09-22T09:00:00Z', attendees: [] },
    attendanceWindow: { start: '2026-09-22T08:00:00Z', end: '2026-09-22T09:00:00Z' }, attendanceThresholdPercent: 80, participants: [],
}
const meeting = { eventId: 'event', organizerId: 'organizer', transactionId: 'transaction', joinUrl: 'https://teams.microsoft.com/meet/123' }
const now = () => new Date('2026-09-22T10:00:00Z')
function setup(state: AcademyIntegrationSession | null = session, claim: AcademyIntegrationJob = job) {
    const ports: AcademyIntegrationPorts = {
        claim: vi.fn(async () => [claim]), loadSession: vi.fn(async () => state), isLeaseCurrent: vi.fn(async () => true),
        complete: vi.fn(async () => {}), fail: vi.fn(async () => {}),
    }
    const adapter: AcademyTeamsAdapter = {
        create: vi.fn(async () => meeting), recover: vi.fn(async () => null), update: vi.fn(async () => meeting),
        cancel: vi.fn(async () => {}), findOnlineMeeting: vi.fn(async () => 'online'), fetchAttendance: vi.fn(async () => []),
    }
    return { ports, adapter, workerId: 'worker', now, random: () => 0 }
}

describe('academy integration worker', () => {
    it('requires current approved published state before any external write', async () => {
        for (const state of [{ ...session, approved: false }, { ...session, published: false }, { ...session, cancelled: true }, { ...session, revision: 3 }]) {
            const deps = setup(state)
            expect((await runAcademyIntegrationBatch(deps)).skipped).toBe(1)
            expect(deps.adapter.create).not.toHaveBeenCalled()
        }
    })
    it('persists successful external identifiers through a single complete callback', async () => {
        const deps = setup()
        expect((await runAcademyIntegrationBatch(deps)).completed).toBe(1)
        expect(deps.ports.complete).toHaveBeenCalledWith(job, { kind: 'meeting_synced', meeting })
    })
    it('respects Retry-After and does not mark forbidden retryable', async () => {
        const deps = setup()
        vi.mocked(deps.adapter.create).mockRejectedValue(new AcademyIntegrationError('throttled', true, 180_000))
        expect((await runAcademyIntegrationBatch(deps)).retry).toBe(1)
        expect(deps.ports.fail).toHaveBeenCalledWith(job, { code: 'throttled', status: 'retry', nextAttemptAt: '2026-09-22T10:03:00.000Z' })
        vi.mocked(deps.adapter.create).mockRejectedValue(new AcademyIntegrationError('forbidden', false))
        expect((await runAcademyIntegrationBatch(deps)).failed).toBe(1)
    })
    it('stops retries after the bounded attempt limit', async () => {
        const deps = setup(session, { ...job, attempt: 12 })
        vi.mocked(deps.adapter.create).mockRejectedValue(new AcademyIntegrationError('unavailable', true))
        expect((await runAcademyIntegrationBatch(deps)).failed).toBe(1)
    })
    it('does not acknowledge a Graph success when DB persistence fails', async () => {
        const deps = setup()
        vi.mocked(deps.ports.complete).mockRejectedValue(new Error('database unavailable'))
        await expect(runAcademyIntegrationBatch(deps)).rejects.toThrow('database unavailable')
        expect(deps.ports.fail).not.toHaveBeenCalled()
    })
    it('recovers an orphan event before cancellation', async () => {
        const deps = setup({ ...session, cancelled: true, published: false }, { ...job, kind: 'cancel_meeting' })
        vi.mocked(deps.adapter.recover).mockResolvedValue(meeting)
        await runAcademyIntegrationBatch(deps)
        expect(deps.adapter.cancel).toHaveBeenCalledWith({ ...session.input, eventId: meeting.eventId })
        expect(deps.adapter.create).not.toHaveBeenCalled()
    })
    it('never calls Graph for an external organizer link or promises automated attendance', async () => {
        const deps = setup({ ...session, mode: 'external_link', externalJoinUrl: meeting.joinUrl }, { ...job, kind: 'sync_attendance' })
        expect((await runAcademyIntegrationBatch(deps)).skipped).toBe(1)
        expect(deps.adapter.fetchAttendance).not.toHaveBeenCalled()
        expect(deps.adapter.create).not.toHaveBeenCalled()
    })
    it('retries missing reports without producing false absences', async () => {
        const deps = setup({ ...session, meeting }, { ...job, kind: 'sync_attendance' })
        expect((await runAcademyIntegrationBatch(deps)).retry).toBe(1)
        expect(deps.ports.complete).not.toHaveBeenCalled()
    })
    it('never replaces a known event when Graph update fails or reports it missing', async () => {
        for (const code of ['not_found', 'forbidden', 'unavailable'] as const) {
            const deps = setup({ ...session, meeting })
            vi.mocked(deps.adapter.update).mockRejectedValue(new AcademyIntegrationError(code, code === 'unavailable'))
            await runAcademyIntegrationBatch(deps)
            expect(deps.adapter.create).not.toHaveBeenCalled()
            expect(deps.ports.complete).not.toHaveBeenCalled()
            expect(deps.ports.fail).toHaveBeenCalled()
        }
    })
    it('refuses a manual link while a managed meeting is still associated with the session', async () => {
        const deps = setup({ ...session, meeting, mode: 'external_link', externalJoinUrl: meeting.joinUrl })
        expect((await runAcademyIntegrationBatch(deps)).failed).toBe(1)
        expect(deps.adapter.create).not.toHaveBeenCalled()
        expect(deps.adapter.update).not.toHaveBeenCalled()
        expect(deps.ports.complete).not.toHaveBeenCalled()
    })
    it('does not confirm cancellation when remote recovery is forbidden', async () => {
        const deps = setup({ ...session, cancelled: true }, { ...job, kind: 'cancel_meeting' })
        vi.mocked(deps.adapter.recover).mockRejectedValue(new AcademyIntegrationError('forbidden', false))
        expect((await runAcademyIntegrationBatch(deps)).failed).toBe(1)
        expect(deps.ports.complete).not.toHaveBeenCalled()
        expect(deps.adapter.create).not.toHaveBeenCalled()
    })
    it('checks the current lease before acting', async () => {
        const deps = setup()
        vi.mocked(deps.ports.isLeaseCurrent).mockResolvedValue(false)
        expect((await runAcademyIntegrationBatch(deps)).skipped).toBe(1)
        expect(deps.adapter.create).not.toHaveBeenCalled()
        expect(deps.ports.complete).not.toHaveBeenCalled()
    })
})
