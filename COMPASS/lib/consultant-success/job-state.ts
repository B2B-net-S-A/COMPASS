import 'server-only'

import type { SuccessAdminClient } from './types'

function safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.slice(0, 1_000)
}

export async function markJobStarted(
    admin: SuccessAdminClient,
    jobName: string,
    startedAt = new Date(),
): Promise<void> {
    const { data: current, error: readError } = await admin
        .from('contractor_success_job_state')
        .select('run_count')
        .eq('job_name', jobName)
        .maybeSingle()
    if (readError) throw new Error(`job_state_read_failed:${readError.message}`)

    const { error } = await admin.from('contractor_success_job_state').upsert({
        job_name: jobName,
        last_started_at: startedAt.toISOString(),
        run_count: Number(current?.run_count ?? 0) + 1,
        last_error: null,
        updated_at: startedAt.toISOString(),
    }, { onConflict: 'job_name' })
    if (error) throw new Error(`job_state_start_failed:${error.message}`)
}

export async function markJobSucceeded(
    admin: SuccessAdminClient,
    jobName: string,
    stats: Record<string, unknown>,
    completedAt = new Date(),
): Promise<void> {
    const timestamp = completedAt.toISOString()
    const { error } = await admin.from('contractor_success_job_state').upsert({
        job_name: jobName,
        cursor: { last_stats: stats },
        last_completed_at: timestamp,
        last_success_at: timestamp,
        last_error: null,
        lease_owner: null,
        lease_expires_at: null,
        updated_at: timestamp,
    }, { onConflict: 'job_name' })
    if (error) throw new Error(`job_state_success_failed:${error.message}`)
}

export async function markJobFailed(
    admin: SuccessAdminClient,
    jobName: string,
    error: unknown,
    completedAt = new Date(),
): Promise<void> {
    const timestamp = completedAt.toISOString()
    const { error: updateError } = await admin.from('contractor_success_job_state').upsert({
        job_name: jobName,
        last_completed_at: timestamp,
        last_error_at: timestamp,
        last_error: safeError(error),
        lease_owner: null,
        lease_expires_at: null,
        updated_at: timestamp,
    }, { onConflict: 'job_name' })
    if (updateError) throw new Error(`job_state_failure_write_failed:${updateError.message}`)
}
