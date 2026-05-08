import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { sendTimesheetReminder } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * Phase 11: monthly timesheet reminder cron.
 *
 * Trigger: 25th of each month, 09:00 (configure in Coolify cron).
 *
 * Preferred (header-based, secret NOT logged in CF/proxy/Sentry traces):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/timesheet-reminder" \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Legacy (query-based, deprecated):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/timesheet-reminder?secret=$CRON_SECRET"
 *
 * Sends reminder email to internal+admin users who do NOT have a timesheet
 * with status 'submitted' or 'approved' for the CURRENT calendar month.
 */
export async function GET(request: Request) {
    // Security: refuse if CRON_SECRET is unconfigured (Coolify env vault hiccup).
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    // Prefer Authorization: Bearer header — query strings end up in CF access
    // logs, Sentry transaction traces, and reverse proxy logs. Fall back to
    // ?secret= for legacy callers; warn so we can migrate them off.
    const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const querySecret = new URL(request.url).searchParams.get('secret')
    const provided = headerSecret || querySecret
    if (!provided || provided !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!headerSecret && querySecret) {
        console.warn('[cron/timesheet-reminder] secret in query param — migrate caller to Authorization: Bearer header')
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const admin = createServiceClient()

    const { data: employees, error: employeesErr } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('role', ['internal', 'admin'])
    if (employeesErr) {
        console.error('[timesheet-reminder] employees fetch error:', employeesErr)
        return NextResponse.json({ error: employeesErr.message }, { status: 500 })
    }

    const { data: existing } = await admin
        .from('timesheets')
        .select('user_id, status')
        .eq('year', year)
        .eq('month', month)
        .in('status', ['submitted', 'approved'])
    const submittedSet = new Set((existing ?? []).map((t: { user_id: string }) => t.user_id))

    const targets = (employees ?? []).filter(
        (e: { id: string; email: string | null }) => !!e.email && !submittedSet.has(e.id),
    ) as Array<{ id: string; full_name: string | null; email: string }>

    let sent = 0
    let failed = 0
    for (const emp of targets) {
        const res = await sendTimesheetReminder(
            emp.email,
            emp.full_name ?? emp.email,
            year,
            month,
        )
        if (res.success) sent += 1
        else failed += 1
    }

    return NextResponse.json({
        ok: true,
        year,
        month,
        total_employees: employees?.length ?? 0,
        already_submitted: submittedSet.size,
        reminders_sent: sent,
        reminders_failed: failed,
    })
}
