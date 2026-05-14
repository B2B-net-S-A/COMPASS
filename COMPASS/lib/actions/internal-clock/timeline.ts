'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { cleanRoutePath, cleanRouteTitle } from '@/lib/clock/daily-summary'
import { assertIsoDate, current5MinBucketIso, getDayIsoRange } from '@/lib/clock/time-zones'

export interface TimelineBlockDTO {
    start: string
    end: string
    activeSeconds: number
    primaryRoute: string | null
    label: string
}

/**
 * R12: get clustered timeline for the user for a given date. Returns blocks of
 * activity with friendly labels (e.g. "9:00-10:30 Akademia"). Falls back to
 * "Praca standardowa" blocks when route metadata is missing.
 */
export async function getMyTimelineForDay(date: string): Promise<TimelineBlockDTO[]> {
    const ctx = await requireInternalOrAdminAction()
    assertIsoDate(date)
    const admin = createServiceClient()
    const { clusterTimeline } = await import('@/lib/clock/timeline-clusterer')
    const { startIso: dayStart, endIso: dayEnd } = getDayIsoRange(date)

    const { data: sessions } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .or(`started_at.lte.${dayEnd},ended_at.gte.${dayStart}`)
    const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id)
    if (sessionIds.length === 0) return []

    const [{ data: hb }, { data: routes }] = await Promise.all([
        admin
            .from('work_clock_heartbeats')
            .select('ts, was_active')
            .in('session_id', sessionIds)
            .gte('ts', dayStart)
            .lte('ts', dayEnd),
        admin
            .from('work_clock_route_metadata')
            .select('ts_bucket_5min, route_path, page_title')
            .in('session_id', sessionIds)
            .gte('ts_bucket_5min', dayStart)
            .lte('ts_bucket_5min', dayEnd),
    ])

    return clusterTimeline(
        (hb ?? []) as Array<{ ts: string; was_active: boolean }>,
        (routes ?? []) as Array<{
            ts_bucket_5min: string
            route_path: string
            page_title: string | null
        }>,
    )
}

/**
 * R12: ingest one route_path observation for the active session. Idempotent
 * via UNIQUE(session_id, ts_bucket_5min, route_path).
 *
 * Privacy: route_path MUST start with /internal or /home — external URLs
 * rejected (via cleanRoutePath). Query strings + hashes stripped.
 */
export async function recordRouteVisit(
    sessionId: string,
    routePath: string,
    pageTitle?: string,
): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const cleanRoute = cleanRoutePath(routePath)
    const cleanTitle = cleanRouteTitle(pageTitle)

    const admin = createServiceClient()
    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, route_tracking_enabled')
        .eq('id', sessionId)
        .single<{
            id: string
            user_id: string
            ended_at: string | null
            route_tracking_enabled: boolean
        }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (session.ended_at) throw new Error('Sesja już zakończona.')
    if (!session.route_tracking_enabled) return

    const { error } = await admin.from('work_clock_route_metadata').insert({
        session_id: sessionId,
        ts_bucket_5min: current5MinBucketIso(),
        route_path: cleanRoute,
        page_title: cleanTitle,
    })
    if (error && error.code !== '23505') {
        throw new Error(`Błąd zapisu route: ${error.message}`)
    }
}

/** R12: enable route tracking for an active session (post-consent v3 acceptance). */
export async function enableRouteTrackingForSession(sessionId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at')
        .eq('id', sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (session.ended_at) throw new Error('Sesja już zakończona.')
    await admin
        .from('work_clock_sessions')
        .update({ route_tracking_enabled: true })
        .eq('id', sessionId)
}
