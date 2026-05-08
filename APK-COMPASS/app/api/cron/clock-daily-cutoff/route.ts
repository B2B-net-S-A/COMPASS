import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { aggregateHeartbeats } from '@/lib/clock/aggregation'
import { logAudit } from '@/lib/actions/audit'
import { sendClockAutoStopped } from '@/lib/email'

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
 * Auth (preferred — secret NOT logged in CF/proxy/Sentry traces):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/clock-daily-cutoff" \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Legacy query-based fallback (deprecated, will warn):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/clock-daily-cutoff?secret=$CRON_SECRET"
 */
export async function GET(request: Request) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    const url = new URL(request.url)
    const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const querySecret = url.searchParams.get('secret')
    const provided = headerSecret || querySecret
    if (!provided || provided !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!headerSecret && querySecret) {
        console.warn(
            '[cron/clock-daily-cutoff] secret in query param — migrate caller to Authorization: Bearer header',
        )
    }

    const admin = createServiceClient()
    const cutoffTs = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString()

    const { data: stale, error } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, started_at')
        .is('ended_at', null)
        .lt('started_at', cutoffTs)

    if (error) {
        console.error('[clock-daily-cutoff] fetch error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const sessions = (stale ?? []) as Array<{ id: string; user_id: string; started_at: string }>
    let closed = 0
    let emailed = 0
    const now = new Date().toISOString()

    for (const s of sessions) {
        const { data: hb } = await admin
            .from('work_clock_heartbeats')
            .select('ts, was_active')
            .eq('session_id', s.id)
        const agg = aggregateHeartbeats((hb ?? []) as Array<{ ts: string; was_active: boolean }>)

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
            console.error('[clock-daily-cutoff] close failed for', s.id, updateErr)
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
}
