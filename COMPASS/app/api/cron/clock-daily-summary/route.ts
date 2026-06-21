import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { findPeakActivityWindow } from '@/lib/clock/aggregation'
import { sendClockDailySummary, type ClockDailySummary } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'

export const dynamic = 'force-dynamic'

/**
 * Phase 17b R11 (PR-C1) — Daily personal summary email (RescueTime style).
 *
 * Trigger: Coolify cron every weekday at 06:00 UTC.
 *
 * For each internal/admin user who:
 *   - had at least one closed session yesterday
 *   - has clock_daily_summary_email = TRUE in profiles
 *   - was NOT on vacation/sick yesterday (attendance_records check)
 *
 * sends a personal email with: total active hours, session count, first/last
 * clock in/out, peak 60-min activity window, pause stats.
 *
 * **CRITICAL**: data is sent ONLY to the user — never cc:admin.
 *
 * Auth (preferred — secret NOT logged in CF/proxy/Sentry traces):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/clock-daily-summary" \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    // Compute "yesterday" UTC date
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const yyyy = yesterday.getUTCFullYear()
    const mm = String(yesterday.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(yesterday.getUTCDate()).padStart(2, '0')
    const yesterdayDate = `${yyyy}-${mm}-${dd}`

    const { data: users } = await admin
        .from('profiles')
        .select('id, full_name, email, clock_daily_summary_email')
        .in('role', ['internal', 'admin'])
        .eq('clock_daily_summary_email', true)

    if (!users || users.length === 0) {
        return NextResponse.json({ ok: true, sent: 0, skipped: 0, scanned: 0 })
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const user of users as Array<{
        id: string
        full_name: string | null
        email: string | null
    }>) {
        if (!user.email) {
            skipped++
            continue
        }

        const { data: attendance } = await admin
            .from('attendance_records')
            .select('status')
            .eq('user_id', user.id)
            .eq('date', yesterdayDate)
            .maybeSingle<{ status: string }>()
        const blockingStatuses = ['vacation', 'sick_leave', 'parental_leave', 'unpaid_leave', 'holiday_in_lieu']
        if (attendance && blockingStatuses.includes(attendance.status)) {
            skipped++
            continue
        }

        const { data: dayAgg } = await admin
            .from('work_clock_daily')
            .select('hours, session_count, first_clock_in, last_clock_out, active_seconds')
            .eq('user_id', user.id)
            .eq('work_date', yesterdayDate)
            .maybeSingle<{
                hours: number
                session_count: number
                first_clock_in: string
                last_clock_out: string
                active_seconds: number
            }>()

        if (!dayAgg || Number(dayAgg.hours) === 0) {
            skipped++
            continue
        }

        const dayStart = `${yesterdayDate}T00:00:00.000Z`
        const dayEnd = `${yesterdayDate}T23:59:59.999Z`
        const { data: sessions } = await admin
            .from('work_clock_sessions')
            .select('id')
            .eq('user_id', user.id)
            .or(`started_at.lte.${dayEnd},ended_at.gte.${dayStart}`)
        const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id)

        let peakWindowLabel: string | null = null
        let pauseCount = 0
        let pauseMinutes = 0

        if (sessionIds.length > 0) {
            const [{ data: hb }, { data: pauses }] = await Promise.all([
                admin
                    .from('work_clock_heartbeats')
                    .select('ts, was_active')
                    .in('session_id', sessionIds)
                    .gte('ts', dayStart)
                    .lte('ts', dayEnd),
                admin
                    .from('work_clock_session_pauses')
                    .select('paused_at, resumed_at')
                    .in('session_id', sessionIds),
            ])

            const heartbeats = (hb ?? []) as Array<{ ts: string; was_active: boolean }>
            const peak = findPeakActivityWindow(heartbeats, 60)
            if (peak) {
                const fmt = (d: Date) =>
                    d.toLocaleTimeString('pl-PL', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Warsaw',
                    })
                peakWindowLabel = `${fmt(peak.start)}-${fmt(peak.end)} (${Math.round(peak.score * 100)}% aktywności)`
            }

            const pauseList = (pauses ?? []) as Array<{
                paused_at: string
                resumed_at: string | null
            }>
            pauseCount = pauseList.length
            pauseMinutes = pauseList.reduce((sum, p) => {
                if (!p.resumed_at) return sum
                return sum + (new Date(p.resumed_at).getTime() - new Date(p.paused_at).getTime()) / 60_000
            }, 0)
        }

        const fmtTime = (iso: string | null) =>
            iso
                ? new Date(iso).toLocaleTimeString('pl-PL', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Warsaw',
                  })
                : null

        const summary: ClockDailySummary = {
            workDate: yesterdayDate,
            activeHours: Number(dayAgg.hours),
            sessionCount: Number(dayAgg.session_count),
            firstClockIn: fmtTime(dayAgg.first_clock_in),
            lastClockOut: fmtTime(dayAgg.last_clock_out),
            peakWindowLabel,
            pauseCount,
            pauseMinutes: Math.round(pauseMinutes),
        }

        const result = await sendClockDailySummary(
            user.email,
            user.full_name ?? user.email,
            summary,
        )
        if (result.success) sent++
        else failed++
    }

    return NextResponse.json({
        ok: true,
        date: yesterdayDate,
        scanned: users.length,
        sent,
        skipped,
        failed,
    })
})
