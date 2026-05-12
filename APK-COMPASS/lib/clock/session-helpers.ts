import 'server-only'

import { createServiceClient } from '@/lib/supabase/admin'
import { aggregateHeartbeats, type PausedRange } from '@/lib/clock/aggregation'
import { logCompat } from '@/lib/logger'
import { headers } from 'next/headers'

/**
 * Phase 18.10 — extracted z lib/actions/internal-clock.ts.
 *
 * Czyste helpery (no business policy, no auth) używane przez session lifecycle
 * (start/stop/transfer/cron auto-stop). Wynoszone żeby:
 *  - Były unit-testowalne bez mockowania `'use server'` env.
 *  - Były dostępne z różnych callsites bez duplikacji.
 *  - lib/actions/internal-clock.ts mógł skupić się na server-action surface area.
 */

/**
 * Fetch all heartbeats dla session, sorted by timestamp.
 */
export async function fetchHeartbeatsForSession(
    supabaseAdmin: ReturnType<typeof createServiceClient>,
    sessionId: string,
): Promise<Array<{ ts: string; was_active: boolean }>> {
    const { data, error } = await supabaseAdmin
        .from('work_clock_heartbeats')
        .select('ts, was_active')
        .eq('session_id', sessionId)
        .order('ts')
    if (error) throw new Error(`Błąd pobierania heartbeats: ${error.message}`)
    return (data ?? []) as Array<{ ts: string; was_active: boolean }>
}

/**
 * Phase 17b R3: fetch all pause ranges for a session. Open pauses
 * (resumed_at IS NULL) są clamped do current moment żeby aggregation
 * mogła kontynuować mid-pause.
 */
export async function fetchPausedRangesForSession(
    supabaseAdmin: ReturnType<typeof createServiceClient>,
    sessionId: string,
): Promise<PausedRange[]> {
    const { data, error } = await supabaseAdmin
        .from('work_clock_session_pauses')
        .select('paused_at, resumed_at')
        .eq('session_id', sessionId)
        .order('paused_at')
    if (error) {
        // Soft-fail: jeśli pauses query errors, fallback do no-pause aggregation
        logCompat.error('[clock/session-helpers] fetchPausedRangesForSession failed', error)
        return []
    }
    const now = new Date().toISOString()
    return ((data ?? []) as Array<{ paused_at: string; resumed_at: string | null }>).map((r) => ({
        from: r.paused_at,
        to: r.resumed_at ?? now,
    }))
}

/**
 * Recompute active/idle seconds dla session na podstawie heartbeats + pauses.
 * Wywoływane gdy zamykamy session (manual stop, cron auto-stop, consent revoke).
 *
 * isSustainedIdle: true jeśli ostatnie 120 heartbeats (60 min @ 30s interval)
 * wszystkie was_active=false — sygnalizuje że session powinna zostać closed.
 */
export async function recomputeActiveSeconds(
    supabaseAdmin: ReturnType<typeof createServiceClient>,
    sessionId: string,
): Promise<{
    activeSeconds: number
    idleSeconds: number
    isSustainedIdle: boolean
    skippedDuringPause: number
}> {
    const [heartbeats, pausedRanges] = await Promise.all([
        fetchHeartbeatsForSession(supabaseAdmin, sessionId),
        fetchPausedRangesForSession(supabaseAdmin, sessionId),
    ])
    const agg = aggregateHeartbeats(heartbeats, pausedRanges)
    return {
        activeSeconds: agg.activeSeconds,
        idleSeconds: agg.idleSeconds,
        skippedDuringPause: agg.skippedDuringPause,
        isSustainedIdle:
            heartbeats.length >= 120 && heartbeats.slice(-120).every((h) => !h.was_active),
    }
}

/**
 * Capture IP + User-Agent z bieżącego HTTP requestu. Używane do audit'u
 * consent acceptance/revocation. Gracefully zwraca null gdy headers()
 * nie jest dostępne (np. w cron context).
 */
export function captureRequestMetadata(): { ip: string | null; ua: string | null } {
    try {
        const h = headers()
        const ip =
            h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            h.get('x-real-ip') ||
            null
        const ua = h.get('user-agent')
        return { ip, ua }
    } catch {
        return { ip: null, ua: null }
    }
}
