// Phase 17 — DB-bound helpers shared across the internal-clock server actions.
//
// Not a 'use server' module — exports include sync helpers (captureRequestMetadata)
// and named types that wouldn't be allowed in a server-action module. The
// sub-action files in this directory import from here.

import { createServiceClient } from '@/lib/supabase/admin'
import { logCompat } from '@/lib/logger'
import { headers } from 'next/headers'
import { aggregateHeartbeats, type PausedRange } from '@/lib/clock/aggregation'
import { isSustainedIdleFromTail } from '@/lib/clock/session-lifecycle'

export type AdminClient = ReturnType<typeof createServiceClient>

export async function fetchHeartbeatsForSession(admin: AdminClient, sessionId: string) {
    const { data, error } = await admin
        .from('work_clock_heartbeats')
        .select('ts, was_active')
        .eq('session_id', sessionId)
        .order('ts')
    if (error) throw new Error(`Błąd pobierania heartbeats: ${error.message}`)
    return (data ?? []) as Array<{ ts: string; was_active: boolean }>
}

/**
 * Phase 17b R3: fetch all pause ranges for a session. Open pauses
 * (resumed_at IS NULL) are clamped to the current moment so aggregation can
 * still proceed mid-pause.
 */
export async function fetchPausedRangesForSession(
    admin: AdminClient,
    sessionId: string,
): Promise<PausedRange[]> {
    const { data, error } = await admin
        .from('work_clock_session_pauses')
        .select('paused_at, resumed_at')
        .eq('session_id', sessionId)
        .order('paused_at')
    if (error) {
        logCompat.error('[internal-clock] fetchPausedRangesForSession failed', error)
        return []
    }
    const now = new Date().toISOString()
    return ((data ?? []) as Array<{ paused_at: string; resumed_at: string | null }>).map((r) => ({
        from: r.paused_at,
        to: r.resumed_at ?? now,
    }))
}

export async function recomputeActiveSeconds(admin: AdminClient, sessionId: string) {
    const [heartbeats, pausedRanges] = await Promise.all([
        fetchHeartbeatsForSession(admin, sessionId),
        fetchPausedRangesForSession(admin, sessionId),
    ])
    const agg = aggregateHeartbeats(heartbeats, pausedRanges)
    return {
        activeSeconds: agg.activeSeconds,
        idleSeconds: agg.idleSeconds,
        skippedDuringPause: agg.skippedDuringPause,
        isSustainedIdle: isSustainedIdleFromTail(heartbeats),
    }
}

export function captureRequestMetadata(): { ip: string | null; ua: string | null } {
    try {
        const h = headers()
        const ip =
            h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
        const ua = h.get('user-agent')
        return { ip, ua }
    } catch {
        return { ip: null, ua: null }
    }
}

export async function fetchTimesheetOwner(admin: AdminClient, timesheetId: string) {
    const { data } = await admin
        .from('timesheets')
        .select('user_id, profiles!inner(email, full_name)')
        .eq('id', timesheetId)
        .single<{ user_id: string; profiles: { email: string; full_name: string | null } }>()
    if (!data) return null
    return { email: data.profiles.email, full_name: data.profiles.full_name }
}
