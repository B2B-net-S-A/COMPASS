'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import {
    calculatePausedUntil,
    validatePauseDurationMinutes,
    type PauseClockInput,
    type PauseClockResult,
} from '@/lib/clock/pause-resume'

/**
 * Pause an active session for N minutes. Records open pause row in
 * work_clock_session_pauses. Auto-resumes when paused_until elapses (cron or
 * on next heartbeat). Heartbeats arriving during pause are NOT counted toward
 * active_seconds (aggregateHeartbeats filters by paused ranges).
 */
export async function pauseClockSession(input: PauseClockInput): Promise<PauseClockResult> {
    const ctx = await requireInternalOrAdminAction()
    validatePauseDurationMinutes(input.durationMinutes)
    const admin = createServiceClient()

    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, paused_until')
        .eq('id', input.sessionId)
        .single<{
            id: string
            user_id: string
            ended_at: string | null
            paused_until: string | null
        }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (session.ended_at) throw new Error('Sesja już zakończona.')

    const pausedUntil = calculatePausedUntil(input.durationMinutes)

    if (session.paused_until) {
        await admin
            .from('work_clock_session_pauses')
            .update({ resumed_at: new Date().toISOString() })
            .eq('session_id', input.sessionId)
            .is('resumed_at', null)
    }

    const { error: insertErr } = await admin.from('work_clock_session_pauses').insert({
        session_id: input.sessionId,
        paused_at: new Date().toISOString(),
        pause_reason: input.reason,
        created_by: ctx.userId,
    })
    if (insertErr) throw new Error(`Błąd pauzy: ${insertErr.message}`)

    const { error: updateErr } = await admin
        .from('work_clock_sessions')
        .update({ paused_until: pausedUntil, pause_reason: input.reason })
        .eq('id', input.sessionId)
    if (updateErr) throw new Error(`Błąd zapisu pauzy: ${updateErr.message}`)

    await logAudit(ctx.userId, 'WORK_CLOCK_PAUSED', {
        session_id: input.sessionId,
        duration_minutes: input.durationMinutes,
        reason: input.reason,
        paused_until: pausedUntil,
    })

    return { pausedUntil, pauseReason: input.reason }
}

/**
 * Explicit user resume (before paused_until elapses). Closes the open pause
 * row and clears paused_until on the session. Cron auto-resume calls this
 * with viaAutomatic=true for audit clarity.
 */
export async function resumeClockSession(
    sessionId: string,
    viaAutomatic = false,
): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()

    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, paused_until')
        .eq('id', sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null; paused_until: string | null }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twoja sesja.')
    }
    if (!session.paused_until) return

    const now = new Date().toISOString()
    await admin
        .from('work_clock_session_pauses')
        .update({ resumed_at: now })
        .eq('session_id', sessionId)
        .is('resumed_at', null)

    await admin
        .from('work_clock_sessions')
        .update({ paused_until: null, pause_reason: null, last_heartbeat: now })
        .eq('id', sessionId)

    await logAudit(ctx.userId, 'WORK_CLOCK_RESUMED', {
        session_id: sessionId,
        via_automatic: viaAutomatic,
    })
}
