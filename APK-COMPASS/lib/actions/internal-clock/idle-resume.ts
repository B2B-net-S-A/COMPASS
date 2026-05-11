'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { type ClockLocation, type StartClockResult } from '@/lib/clock/constants'
import { cleanClientTz, cleanDeviceLabel } from '@/lib/clock/session-lifecycle'

const RESUME_GRACE_MINUTES = 30

export interface RecentlyClosedSessionDTO {
    id: string
    started_at: string
    ended_at: string
    closed_reason: 'idle_timeout' | 'sleep_detected'
    active_seconds: number
}

/**
 * Most recent auto-closed session (idle_timeout or sleep_detected) for the
 * current user, but only if closed within the last 30 minutes. Used by the
 * client-side IdleResumeDialog to show the 4-option modal.
 */
export async function getRecentlyAutoClosedSession(): Promise<RecentlyClosedSessionDTO | null> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const cutoff = new Date(Date.now() - RESUME_GRACE_MINUTES * 60 * 1000).toISOString()
    const { data } = await supabase
        .from('work_clock_sessions')
        .select('id, started_at, ended_at, closed_reason, active_seconds, user_disregarded')
        .eq('user_id', ctx.userId)
        .in('closed_reason', ['idle_timeout', 'sleep_detected'])
        .gt('ended_at', cutoff)
        .eq('user_disregarded', false)
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle<{
            id: string
            started_at: string
            ended_at: string
            closed_reason: 'idle_timeout' | 'sleep_detected'
            active_seconds: number
            user_disregarded: boolean
        }>()
    if (!data) return null
    return {
        id: data.id,
        started_at: data.started_at,
        ended_at: data.ended_at,
        closed_reason: data.closed_reason,
        active_seconds: data.active_seconds,
    }
}

/**
 * "Discard idle time" — user chose to drop the auto-closed session entirely.
 * Soft mark only (KP retention 5y).
 */
export async function discardAutoClosedSession(sessionId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: row } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, user_disregarded')
        .eq('id', sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null; user_disregarded: boolean }>()
    if (!row) throw new Error('Sesja nie istnieje.')
    if (row.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twoja sesja.')
    }
    if (row.user_disregarded) return
    await admin
        .from('work_clock_sessions')
        .update({ user_disregarded: true })
        .eq('id', sessionId)
    await logAudit(ctx.userId, 'WORK_CLOCK_RESUME_DISCARDED', { session_id: sessionId })
}

/**
 * "Keep tracking (merge)" — user chose to keep the idle hours and continue
 * working. Starts a new session with merged_from_session_id pointing at the
 * old one; daily aggregation SUMs both via work_clock_daily.
 */
export async function mergeWithPreviousSession(
    prevSessionId: string,
    deviceLabel: string,
    clientTz: string,
): Promise<StartClockResult> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()

    const { data: prev } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, location')
        .eq('id', prevSessionId)
        .single<{ id: string; user_id: string; ended_at: string | null; location: ClockLocation }>()
    if (!prev) throw new Error('Poprzednia sesja nie istnieje.')
    if (prev.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (!prev.ended_at) throw new Error('Poprzednia sesja jest jeszcze aktywna — nie można scalić.')

    const { data: existing } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .is('ended_at', null)
        .maybeSingle<{ id: string }>()
    if (existing) throw new Error('Masz już aktywną sesję — nie można scalić.')

    const now = new Date().toISOString()
    const { data: created, error } = await admin
        .from('work_clock_sessions')
        .insert({
            user_id: ctx.userId,
            started_at: now,
            last_heartbeat: now,
            active_seconds: 0,
            idle_seconds: 0,
            device_label: cleanDeviceLabel(deviceLabel),
            client_tz: cleanClientTz(clientTz),
            location: prev.location,
            created_by: ctx.userId,
            merged_from_session_id: prevSessionId,
        })
        .select('id, started_at, location')
        .single<{ id: string; started_at: string; location: ClockLocation }>()
    if (error || !created) throw new Error(`Błąd scalenia: ${error?.message ?? 'unknown'}`)

    await logAudit(ctx.userId, 'WORK_CLOCK_RESUME_MERGED', {
        new_session_id: created.id,
        merged_from: prevSessionId,
    })
    return {
        sessionId: created.id,
        startedAt: created.started_at,
        location: created.location,
        resumedExisting: false,
    }
}
