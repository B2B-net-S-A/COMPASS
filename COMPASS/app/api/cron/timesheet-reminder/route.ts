import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { sendTimesheetReminder, type TimesheetReminderPhase } from '@/lib/email'
import { postToTeamsAlert } from '@/lib/teams/webhook'
import { withCronAuth } from '@/lib/api/with-auth'

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
export const GET = withCronAuth(async (request, { admin }) => {
    const url = new URL(request.url)
    const now = new Date()
    const dayOfMonth = now.getDate()
    const dayOfWeek = now.getDay() // 0=Sunday … 6=Saturday

    // Phase 17b R9 (PR-B): added 'mon-nudge' (gentle Mon) and 'wed-warning'
    // (urgency Wed). Auto-detect picks based on weekday/day-of-month if no
    // explicit ?phase is given.
    const phaseParam = url.searchParams.get('phase')
    const VALID_PHASES = ['mon-nudge', 'wed-warning', 'warning', 'final'] as const
    const phase: TimesheetReminderPhase =
        phaseParam && (VALID_PHASES as readonly string[]).includes(phaseParam)
            ? (phaseParam as TimesheetReminderPhase)
            : dayOfMonth < 15
              ? 'final' // first half of month → cron for previous month's final
              : dayOfWeek === 1
                ? 'mon-nudge'
                : dayOfWeek === 3
                  ? 'wed-warning'
                  : 'warning'

    // R9 antispam guard: mon-nudge in first 5 days of the month is irrelevant
    // (nobody fills timesheet on day 1-5 for current month — they're still
    // working). Skip early to avoid noise.
    if (phase === 'mon-nudge' && dayOfMonth < 5) {
        return NextResponse.json({
            ok: true,
            phase,
            skipped: 'too_early_in_month',
            day_of_month: dayOfMonth,
        })
    }

    // Target month: final = previous month, others = current month
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

    const { data: employees, error: employeesErr } = await admin
        .from('profiles')
        .select('id, full_name, email, employment_type')
        .in('role', ['internal', 'admin'])
    if (employeesErr) {
        logCompat.error('[timesheet-reminder] employees fetch error:', employeesErr)
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

    // PR3: batch Teams alert before sending individual emails (only when
    // there are pending users — skip noise when everyone's already submitted).
    if (targets.length > 0) {
        const monthLabel = `${targetYear}-${String(targetMonth).padStart(2, '0')}`
        const phaseColor =
            phase === 'final' ? 'EF4444' : phase === 'wed-warning' ? 'F59E0B' : '3B82F6'
        postToTeamsAlert({
            title: `Timesheet reminder ${phase} — ${monthLabel}`,
            text: `${targets.length} ${targets.length === 1 ? 'osoba nie złożyła' : 'osób nie złożyło'} jeszcze timesheetu za ${monthLabel}.`,
            themeColor: phaseColor,
            facts: [
                { name: 'Faza', value: phase },
                { name: 'Miesiąc', value: monthLabel },
                { name: 'Zaległych', value: String(targets.length) },
            ],
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'}/internal/admin?tab=timesheets`,
        }).catch((e) => logCompat.error('[timesheet-reminder] teams alert failed:', e))
    }

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
})
