import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { sendTimesheetReminder, type TimesheetReminderPhase } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * Phase 11 + H2.1: timesheet reminder cron with two phases.
 *
 * H2.1: Konfiguruj DWA cron jobs w Coolify (lub server cron):
 *   - 25-go każdego miesiąca: ?phase=warning  → reminder o terminie (5. dnia next month)
 *   - 5-go każdego miesiąca:  ?phase=final    → ostatnia szansa za POPRZEDNI miesiąc
 *
 * Auth (preferred — secret NOT logged in CF/proxy/Sentry traces):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/timesheet-reminder?phase=warning" \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Legacy (query-based, deprecated):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/timesheet-reminder?secret=$SECRET&phase=warning"
 *
 * Auto-detect (gdy brak ?phase): day < 15 → final (poprzedni miesiąc), inaczej warning (bieżący).
 * Można też explicit ?year=&month= dla manual testing.
 */
export async function GET(request: Request) {
    // Security: refuse if CRON_SECRET is unconfigured (Coolify env vault hiccup).
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    // Prefer Authorization: Bearer header — query strings end up in CF access
    // logs, Sentry transaction traces, and reverse proxy logs. Fall back to
    // ?secret= for legacy callers; warn so we can migrate them off.
    const url = new URL(request.url)
    const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const querySecret = url.searchParams.get('secret')
    const provided = headerSecret || querySecret
    if (!provided || provided !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!headerSecret && querySecret) {
        console.warn('[cron/timesheet-reminder] secret in query param — migrate caller to Authorization: Bearer header')
    }

    const now = new Date()
    const dayOfMonth = now.getDate()

    // Phase auto-detect z fallback do explicit ?phase
    const phaseParam = url.searchParams.get('phase')
    const phase: TimesheetReminderPhase =
        phaseParam === 'warning' || phaseParam === 'final'
            ? phaseParam
            : dayOfMonth < 15
              ? 'final'
              : 'warning'

    // Target month: warning = current month, final = previous month
    let targetYear = now.getFullYear()
    let targetMonth = now.getMonth() + 1
    if (phase === 'final') {
        if (targetMonth === 1) {
            targetYear -= 1
            targetMonth = 12
        } else {
            targetMonth -= 1
        }
    }
    // Explicit override
    const yearParam = url.searchParams.get('year')
    const monthParam = url.searchParams.get('month')
    if (yearParam) targetYear = parseInt(yearParam, 10)
    if (monthParam) targetMonth = parseInt(monthParam, 10)

    const admin = createServiceClient()

    const { data: employees, error: employeesErr } = await admin
        .from('profiles')
        .select('id, full_name, email, employment_type')
        .in('role', ['internal', 'admin'])
    if (employeesErr) {
        console.error('[timesheet-reminder] employees fetch error:', employeesErr)
        return NextResponse.json({ error: employeesErr.message }, { status: 500 })
    }

    const { data: existing } = await admin
        .from('timesheets')
        .select('user_id, status')
        .eq('year', targetYear)
        .eq('month', targetMonth)
        .in('status', ['submitted', 'approved'])
    const submittedSet = new Set((existing ?? []).map((t: { user_id: string }) => t.user_id))

    // Skip B2B employees (timesheet pakiet UoP only)
    const targets = (employees ?? []).filter(
        (e: { id: string; email: string | null; employment_type: string | null }) =>
            !!e.email && !submittedSet.has(e.id) && e.employment_type !== 'b2b',
    ) as Array<{ id: string; full_name: string | null; email: string }>

    let sent = 0
    let failed = 0
    for (const emp of targets) {
        const res = await sendTimesheetReminder(
            emp.email,
            emp.full_name ?? emp.email,
            targetYear,
            targetMonth,
            phase,
        )
        if (res.success) sent += 1
        else failed += 1
    }

    return NextResponse.json({
        ok: true,
        phase,
        year: targetYear,
        month: targetMonth,
        total_employees: employees?.length ?? 0,
        already_submitted: submittedSet.size,
        reminders_sent: sent,
        reminders_failed: failed,
    })
}
