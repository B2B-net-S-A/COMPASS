import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AcademyIntegrationError } from './teams'
import {
    runAcademyIntegrationBatch,
    type AcademyBatchResult,
    type AcademyIntegrationPorts,
    type AcademyTeamsAdapter,
} from './integration-worker'

const uuid = z.uuid()
const timestamp = z.iso.datetime({ offset: true })
const jobSchema = z.object({
    id: uuid, sessionId: uuid, revision: z.number().int().positive(),
    kind: z.enum(['sync_meeting', 'cancel_meeting', 'sync_attendance']),
    attempt: z.number().int().positive(), leaseToken: uuid,
})
const sessionSchema = z.object({
    id: uuid, revision: z.number().int().positive(), approved: z.boolean(), published: z.boolean(), cancelled: z.boolean(),
    mode: z.enum(['managed_teams', 'external_link']), externalJoinUrl: z.string().nullish(),
    organizerEnabled: z.boolean(), attendanceWindowConfirmed: z.boolean(),
    meeting: z.object({ eventId: z.string().min(1), joinUrl: z.string(), transactionId: z.string().min(1), organizerId: uuid }).nullable(),
    onlineMeetingId: z.string().nullish(),
    input: z.object({
        sessionId: uuid, organizer: z.object({ tenantId: uuid, userId: uuid }), subject: z.string(),
        startDateTime: timestamp, endDateTime: timestamp, timeZone: z.string(), descriptionText: z.string().optional(),
        attendees: z.array(z.object({ email: z.email(), name: z.string().nullish() })),
    }),
    attendanceWindow: z.object({ start: timestamp, end: timestamp }),
    attendanceThresholdPercent: z.number().int().min(1).max(100),
    participants: z.array(z.object({ profileId: uuid,
        identities: z.array(z.object({ tenantId: uuid, objectId: uuid })), verifiedEmails: z.array(z.email()),
    })),
})

/** Presence of app credentials is configuration readiness, not proof of Microsoft grants. */
export function academyManagedTeamsConfiguration(env: NodeJS.ProcessEnv = process.env): { managedTeamsAvailable: boolean; reason?: string } {
    if (env.ACADEMY_TEAMS_ENABLED !== 'true') return {
        managedTeamsAvailable: false,
        reason: 'Automatyczne spotkania Teams oczekują na uruchomienie przez administratora. Możesz użyć linku od prowadzącego.',
    }
    if (!env.AZURE_TENANT_ID || !uuid.safeParse(env.AZURE_TENANT_ID).success || !env.AZURE_CLIENT_ID || !env.AZURE_CLIENT_SECRET) {
        return { managedTeamsAvailable: false, reason: 'Integracja Microsoft 365 nie jest skonfigurowana. Możesz użyć linku zewnętrznego.' }
    }
    return { managedTeamsAvailable: true }
}

/** Raw evidence is never deleted until an explicit, bounded policy is configured. */
export function academyAttendanceRetentionConfiguration(env: NodeJS.ProcessEnv = process.env): { rawAttendanceRetentionDays: number | null; retentionWarning?: string } {
    const configured = env.ACADEMY_ATTENDANCE_RETENTION_DAYS
    const days = configured && /^\d+$/.test(configured) ? Number(configured) : NaN
    if (!Number.isSafeInteger(days) || days < 30 || days > 3650) return {
        rawAttendanceRetentionDays: null,
        retentionWarning: configured
            ? 'Retencja raportów obecności ma nieprawidłową konfigurację (30–3650 dni). Automatyczne usuwanie jest wyłączone.'
            : 'Nie ustalono retencji surowych raportów obecności. Administrator powinien ustalić politykę przed uruchomieniem automatycznej obecności.',
    }
    return { rawAttendanceRetentionDays: days }
}

async function rpc<T>(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error) {
        // Keep raw DB details out of queue/public errors; codes are sufficient for safe diagnostics.
        const retryable = ['40001', '40P01', '55P03', '57014', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(error.code)
        throw new AcademyIntegrationError(retryable ? 'unavailable' : 'configuration', retryable)
    }
    return data as T
}

export function createAcademyIntegrationPorts(client: SupabaseClient): AcademyIntegrationPorts {
    return {
        async claim(input) {
            const data = await rpc<unknown>(client, 'academy_claim_jobs', {
                p_worker_id: input.workerId, p_limit: input.limit, p_lease_seconds: input.leaseSeconds,
            })
            const parsed = z.array(jobSchema).safeParse(data)
            if (!parsed.success) throw new AcademyIntegrationError('invalid_response', false)
            return parsed.data
        },
        async loadSession(job) {
            const data = await rpc<unknown>(client, 'academy_job_context', { p_job_id: job.id, p_lease_token: job.leaseToken })
            if (data === null) return null
            const parsed = sessionSchema.safeParse(data)
            if (!parsed.success) throw new AcademyIntegrationError('invalid_response', false)
            const session = parsed.data
            if (session.mode === 'managed_teams' && job.kind !== 'cancel_meeting' && !session.organizerEnabled) {
                throw new AcademyIntegrationError('configuration', false)
            }
            if (job.kind === 'sync_attendance' && !session.attendanceWindowConfirmed) {
                throw new AcademyIntegrationError('invalid_input', false)
            }
            return {
                ...session,
                externalJoinUrl: session.externalJoinUrl ?? undefined,
                onlineMeetingId: session.onlineMeetingId ?? undefined,
                input: { ...session.input, attendees: session.input.attendees.map(a => ({ email: a.email, name: a.name ?? undefined })) },
            }
        },
        async isLeaseCurrent(job) {
            return await rpc<unknown>(client, 'academy_job_lease_current', { p_job_id: job.id, p_lease_token: job.leaseToken }) === true
        },
        async complete(job, outcome) {
            await rpc(client, 'academy_complete_job', { p_job_id: job.id, p_lease_token: job.leaseToken, p_outcome: outcome })
        },
        async fail(job, failure) {
            await rpc(client, 'academy_fail_job', {
                p_job_id: job.id, p_lease_token: job.leaseToken, p_code: failure.code,
                p_status: failure.status, p_next_attempt_at: failure.nextAttemptAt,
            })
        },
    }
}

export async function runAcademyDatabaseSync(input: {
    client: SupabaseClient
    adapter?: AcademyTeamsAdapter
    env?: NodeJS.ProcessEnv
    workerId?: string
}): Promise<AcademyBatchResult & { managedTeamsEnabled: boolean; notifications: number; rawReportsPurged: number; retentionConfigured: boolean; reason?: string }> {
    // External-link sessions need reminders even when Microsoft integration is disabled.
    const notifications = await rpc<number>(input.client, 'academy_dispatch_reminders', { p_limit: 500 })
    const retention = academyAttendanceRetentionConfiguration(input.env)
    const rawReportsPurged = retention.rawAttendanceRetentionDays === null ? 0 : await rpc<number>(input.client, 'academy_purge_attendance_reports', {
        p_retention_days: retention.rawAttendanceRetentionDays,
    })
    const retentionConfigured = retention.rawAttendanceRetentionDays !== null
    const config = academyManagedTeamsConfiguration(input.env)
    if (!config.managedTeamsAvailable) return {
        managedTeamsEnabled: false, reason: config.reason, notifications, rawReportsPurged, retentionConfigured,
        claimed: 0, completed: 0, skipped: 0, retry: 0, failed: 0, interrupted: 0,
    }
    const result = await runAcademyIntegrationBatch({
        ports: createAcademyIntegrationPorts(input.client), adapter: input.adapter,
        workerId: input.workerId ?? `academy-${randomUUID()}`, limit: 5, timeBudgetMs: 45_000,
    })
    return { ...result, managedTeamsEnabled: true, notifications, rawReportsPurged, retentionConfigured }
}
