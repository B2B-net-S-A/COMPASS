import 'server-only'

import {
    AcademyIntegrationError,
    cancelTeamsCalendarEvent,
    classifyAcademyIntegrationError,
    createTeamsCalendarEvent,
    fetchTeamsAttendance,
    findTeamsOnlineMeeting,
    recoverTeamsCalendarEventId,
    updateTeamsCalendarEvent,
    validateTeamsJoinUrl,
    type MeetingReference,
    type TeamsSessionInput,
} from './teams'
import {
    evaluateSessionAttendance,
    type AttendanceEvaluation,
    type AttendanceInterval,
    type AttendanceParticipant,
    type AttendanceReport,
} from './attendance'

export interface AcademyIntegrationJob {
    id: string
    sessionId: string
    revision: number
    kind: 'sync_meeting' | 'cancel_meeting' | 'sync_attendance'
    attempt: number
    leaseToken: string
}
export interface AcademyIntegrationSession {
    id: string
    revision: number
    approved: boolean
    published: boolean
    cancelled: boolean
    mode: 'managed_teams' | 'external_link'
    externalJoinUrl?: string
    meeting: MeetingReference | null
    onlineMeetingId?: string
    input: TeamsSessionInput
    attendanceWindow: AttendanceInterval
    attendanceThresholdPercent: number
    participants: AttendanceParticipant[]
}
export type AcademyIntegrationOutcome =
    | { kind: 'meeting_synced'; meeting: MeetingReference }
    | { kind: 'external_link_validated'; joinUrl: string }
    | { kind: 'meeting_cancelled' }
    | { kind: 'attendance_synced'; onlineMeetingId: string; reports: AttendanceReport[]; evaluation: AttendanceEvaluation }
    | { kind: 'skipped'; reason: 'stale_revision' | 'not_published' | 'session_missing' | 'cancel_not_requested' | 'lease_lost' | 'external_attendance' }

/**
 * DB implementation MUST:
 * - claim with SKIP LOCKED, one in-flight job per session and a bounded lease;
 * - return server-authorized state, never trust a client-authored Graph payload;
 * - atomically persist result + ACK with the lease token (including report deduplication);
 * - preserve meeting IDs even if a newer revision arrived during the Graph request,
 *   enqueueing reconciliation instead of losing the newly created event;
 * - preserve manual attendance overrides when storing imported evidence.
 */
export interface AcademyIntegrationPorts {
    claim(input: { workerId: string; limit: number; leaseSeconds: number }): Promise<AcademyIntegrationJob[]>
    loadSession(job: AcademyIntegrationJob): Promise<AcademyIntegrationSession | null>
    isLeaseCurrent(job: AcademyIntegrationJob): Promise<boolean>
    complete(job: AcademyIntegrationJob, outcome: AcademyIntegrationOutcome): Promise<void>
    fail(job: AcademyIntegrationJob, failure: {
        code: string
        status: 'retry' | 'failed'
        nextAttemptAt: string | null
    }): Promise<void>
}
export interface AcademyTeamsAdapter {
    create: typeof createTeamsCalendarEvent
    recover: typeof recoverTeamsCalendarEventId
    update: typeof updateTeamsCalendarEvent
    cancel: typeof cancelTeamsCalendarEvent
    findOnlineMeeting: typeof findTeamsOnlineMeeting
    fetchAttendance: typeof fetchTeamsAttendance
}
const defaultAdapter: AcademyTeamsAdapter = {
    create: createTeamsCalendarEvent,
    recover: recoverTeamsCalendarEventId,
    update: updateTeamsCalendarEvent,
    cancel: cancelTeamsCalendarEvent,
    findOnlineMeeting: findTeamsOnlineMeeting,
    fetchAttendance: fetchTeamsAttendance,
}

export interface AcademyBatchResult { claimed: number; completed: number; skipped: number; retry: number; failed: number; interrupted: number }

async function executeJob(
    job: AcademyIntegrationJob,
    session: AcademyIntegrationSession | null,
    ports: AcademyIntegrationPorts,
    adapter: AcademyTeamsAdapter,
    now: Date,
): Promise<AcademyIntegrationOutcome> {
    if (!session) return { kind: 'skipped', reason: 'session_missing' }
    if (session.id !== job.sessionId || session.input.sessionId !== job.sessionId) throw new AcademyIntegrationError('invalid_input', false)
    if (session.revision !== job.revision) return { kind: 'skipped', reason: 'stale_revision' }
    if (!await ports.isLeaseCurrent(job)) return { kind: 'skipped', reason: 'lease_lost' }
    // Organizer changes need a separate cancel/recreate operation; silently PATCHing another mailbox is unsafe.
    if (session.meeting && session.meeting.organizerId.toLowerCase() !== session.input.organizer.userId.toLowerCase()) {
        throw new AcademyIntegrationError('conflict', false)
    }
    if (job.kind === 'cancel_meeting') {
        if (!session.cancelled) return { kind: 'skipped', reason: 'cancel_not_requested' }
        if (session.mode === 'external_link') {
            if (session.meeting) throw new AcademyIntegrationError('conflict', false)
            return { kind: 'meeting_cancelled' }
        }
        // Also find an event created before the previous worker died without persisting its ID.
        const meeting = session.meeting ?? await adapter.recover(session.input)
        if (meeting) await adapter.cancel({ ...session.input, eventId: meeting.eventId })
        return { kind: 'meeting_cancelled' }
    }
    if (!session.approved || !session.published || session.cancelled) return { kind: 'skipped', reason: 'not_published' }
    if (session.mode === 'external_link') {
        if (session.meeting) throw new AcademyIntegrationError('conflict', false)
        const joinUrl = validateTeamsJoinUrl(session.externalJoinUrl ?? '')
        return job.kind === 'sync_attendance' ? { kind: 'skipped', reason: 'external_attendance' }
            : { kind: 'external_link_validated', joinUrl }
    }
    if (job.kind === 'sync_meeting') {
        const meeting = session.meeting
            ? await adapter.update({ ...session.input, eventId: session.meeting.eventId })
            : await adapter.create(session.input)
        return { kind: 'meeting_synced', meeting }
    }
    if (Date.parse(session.attendanceWindow.end) >= now.getTime()) {
        throw new AcademyIntegrationError('attendance_pending', true,
            Math.max(60_000, Date.parse(session.attendanceWindow.end) - now.getTime() + 300_000))
    }
    if (!session.meeting) throw new AcademyIntegrationError('meeting_not_ready', true, 60_000)
    const onlineMeetingId = session.onlineMeetingId ?? await adapter.findOnlineMeeting({
        organizerId: session.meeting.organizerId,
        joinUrl: session.meeting.joinUrl,
    })
    const reports = await adapter.fetchAttendance({ organizerId: session.meeting.organizerId, onlineMeetingId })
    const relevantReports = reports.filter(report => Date.parse(report.endDateTime) > Date.parse(session.attendanceWindow.start)
        && Date.parse(report.startDateTime) < Date.parse(session.attendanceWindow.end))
    if (!relevantReports.length) throw new AcademyIntegrationError('attendance_pending', true, 300_000)
    return {
        kind: 'attendance_synced',
        onlineMeetingId,
        reports: relevantReports,
        evaluation: evaluateSessionAttendance({
            reports: relevantReports,
            participants: session.participants,
            window: session.attendanceWindow,
            thresholdPercent: session.attendanceThresholdPercent,
        }),
    }
}

/** One bounded pass; no in-request sleeping or retry multiplication on top of Graph SDK retries. */
export async function runAcademyIntegrationBatch(input: {
    ports: AcademyIntegrationPorts
    adapter?: AcademyTeamsAdapter
    workerId: string
    limit?: number
    maxAttempts?: number
    timeBudgetMs?: number
    now?: () => Date
    random?: () => number
}): Promise<AcademyBatchResult> {
    const { ports, workerId } = input
    const now = input.now ?? (() => new Date())
    const random = input.random ?? Math.random
    const adapter = input.adapter ?? defaultAdapter
    const limit = input.limit ?? 5
    const maxAttempts = input.maxAttempts ?? 12
    const timeBudgetMs = input.timeBudgetMs ?? 45_000
    if (!workerId || !Number.isInteger(limit) || limit < 1 || limit > 20
        || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100
        || timeBudgetMs < 1000 || timeBudgetMs > 240_000) throw new AcademyIntegrationError('invalid_input', false)
    const start = now().getTime()
    const jobs = await ports.claim({ workerId, limit, leaseSeconds: Math.ceil(timeBudgetMs / 1000) + 120 })
    const result: AcademyBatchResult = { claimed: jobs.length, completed: 0, skipped: 0, retry: 0, failed: 0, interrupted: 0 }
    for (const job of jobs) {
        if (now().getTime() - start >= timeBudgetMs) {
            // Release unstarted jobs via retry; never abandon them in processing until lease expiry.
            await ports.fail(job, { code: 'batch_budget', status: 'retry', nextAttemptAt: now().toISOString() })
            result.interrupted++
            continue
        }
        let outcome: AcademyIntegrationOutcome
        try {
            const session = await ports.loadSession(job)
            outcome = await executeJob(job, session, ports, adapter, now())
        } catch (error) {
            const classified = classifyAcademyIntegrationError(error)
            const retry = classified.retryable && job.attempt < maxAttempts
            const backoffMs = Math.min(6 * 60 * 60_000, 30_000 * Math.pow(2, Math.max(0, Math.min(job.attempt - 1, 10))))
            const jitter = Math.floor(Math.max(0, Math.min(1, random())) * 10_000)
            // Retry-After is a minimum, not a value to cap at our exponential-backoff ceiling.
            const delayMs = Math.max(backoffMs + jitter, classified.retryAfterMs ?? 0)
            await ports.fail(job, {
                code: classified.code,
                status: retry ? 'retry' : 'failed',
                nextAttemptAt: retry ? new Date(now().getTime() + delayMs).toISOString() : null,
            })
            result[retry ? 'retry' : 'failed']++
            continue
        }
        // Let a persistence failure escape. The lease/recovery path must retry the same operation;
        // acknowledging it as an integration error could discard the successful external write.
        if (!(outcome.kind === 'skipped' && outcome.reason === 'lease_lost')) await ports.complete(job, outcome)
        result[outcome.kind === 'skipped' ? 'skipped' : 'completed']++
    }
    return result
}
