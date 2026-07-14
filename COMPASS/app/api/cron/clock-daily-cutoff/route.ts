import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { aggregateHeartbeats } from '@/lib/clock/aggregation'
import { logAudit } from '@/lib/actions/audit'
import { sendClockAutoStopped } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'

export const dynamic = 'force-dynamic'

/**
 * Phase 17 — daily cutoff cron.
 *
 * Closes any live work_clock_session that has been running for > 16 hours.
 * Picks 16h instead of "midnight" to be timezone-tolerant and to allow late
 * shifts (start 18:00, work past midnight, close at 10:00 next day).
 *
 * Trigger: Coolify cron daily at 04:00 UTC.
 *
 * Auth (required — secret NOT logged in CF/proxy/Sentry traces):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/clock-daily-cutoff" \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    const cutoffTs = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString()

    const { data: stale, error } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, started_at')
        .is('ended_at', null)
        .lt('started_at', cutoffTs)

    if (error) {
        logCompat.error('[clock-daily-cutoff] fetch error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const sessions = (stale ?? []) as Array<{ id: string; user_id: string; started_at: string }>
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
        }>).map((p) => ({ from: p.paused_at, to: p.resumed_at ?? now }))
        const agg = aggregateHeartbeats(
            (hb ?? []) as Array<{ ts: string; was_active: boolean }>,
            pausedRanges,
        )

        const { error: updateErr } = await admin
            .from('work_clock_sessions')
            .update({
                ended_at: now,
                closed_reason: 'daily_cutoff',
                active_seconds: agg.activeSeconds,
                idle_seconds: agg.idleSeconds,
            })
            .eq('id', s.id)
        if (updateErr) {
            logCompat.error('[clock-daily-cutoff] close failed for', s.id, updateErr)
            continue
        }
        closed++
        await logAudit(s.user_id, 'WORK_CLOCK_AUTO_STOPPED', {
            session_id: s.id,
            reason: 'daily_cutoff',
            active_seconds: agg.activeSeconds,
        })

        // Notify user
        const { data: profile } = await admin
            .from('profiles')
            .select('email, full_name')
            .eq('id', s.user_id)
            .single<{ email: string; full_name: string | null }>()
        if (profile?.email) {
            const res = await sendClockAutoStopped(
                profile.email,
                profile.full_name ?? profile.email,
                'daily_cutoff',
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
