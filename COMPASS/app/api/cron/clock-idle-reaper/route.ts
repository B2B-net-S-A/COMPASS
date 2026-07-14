import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { aggregateHeartbeats } from '@/lib/clock/aggregation'
import { logAudit } from '@/lib/actions/audit'
import { sendClockAutoStopped } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'

export const dynamic = 'force-dynamic'

/**
 * Phase 17 — idle reaper cron.
 *
 * Closes sessions whose `last_heartbeat` is older than 60 min (network drop,
 * laptop sleep without sendBeacon, browser closed without unload event).
 * Complements the in-request sustained-idle detection in /api/clock/heartbeat.
 *
 * Trigger: every 15 min via Coolify cron.
 *
 * Auth (required — secret NOT logged in CF/proxy/Sentry traces):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/clock-idle-reaper" \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    const stalenessTs = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const nowTs = new Date().toISOString()

    // Phase 17b R3: skip sessions that are explicitly paused (paused_until > now).
    // Server-side belt-and-suspenders: even if cron fires during a 120-min pause,
    // we don't auto-close the session as idle.
    const { data: stale, error } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, last_heartbeat, paused_until')
        .is('ended_at', null)
        .lt('last_heartbeat', stalenessTs)
        .or(`paused_until.is.null,paused_until.lte.${nowTs}`)

    if (error) {
        logCompat.error('[clock-idle-reaper] fetch error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const sessions = (stale ?? []) as Array<{ id: string; user_id: string; last_heartbeat: string }>
    let closed = 0
    let emailed = 0
    const now = new Date().toISOString()

    for (const s of sessions) {
        const [{ data: hb }, { data: pauses }] = await Promise.all([
            admin.from('work_clock_heartbeats').select('ts, was_active').eq('session_id', s.id),
            admin
                .from('work_clock_session_pauses')
                .select('paused_at, resumed_at')
                .eq('session_id', s.id),
        ])
        const pausedRanges = ((pauses ?? []) as Array<{
            paused_at: string
            resumed_at: string | null
        }>).map((p) => ({ from: p.paused_at, to: p.resumed_at ?? nowTs }))
        const agg = aggregateHeartbeats(
            (hb ?? []) as Array<{ ts: string; was_active: boolean }>,
            pausedRanges,
        )

        const { error: updateErr } = await admin
            .from('work_clock_sessions')
            .update({
                ended_at: now,
                closed_reason: 'idle_timeout',
                active_seconds: agg.activeSeconds,
                idle_seconds: agg.idleSeconds,
            })
            .eq('id', s.id)
        if (updateErr) {
            logCompat.error('[clock-idle-reaper] close failed for', s.id, updateErr)
            continue
        }
        closed++
        await logAudit(s.user_id, 'WORK_CLOCK_AUTO_STOPPED', {
            session_id: s.id,
            reason: 'idle_timeout',
            active_seconds: agg.activeSeconds,
        })

        const { data: profile } = await admin
            .from('profiles')
            .select('email, full_name')
            .eq('id', s.user_id)
            .single<{ email: string; full_name: string | null }>()
        if (profile?.email) {
            const res = await sendClockAutoStopped(
                profile.email,
                profile.full_name ?? profile.email,
                'idle_timeout',
                agg.activeSeconds / 3600,
            )
            if (res.success) emailed++
        }
    }

    return NextResponse.json({
        ok: true,
        scanned: sessions.length,
        closed,
        emailed,
    })
})
