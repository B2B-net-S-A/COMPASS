import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    hashCalendarFeedToken,
    isCalendarFeedToken,
    isLegacyCalendarUserId,
} from '@/lib/calendar/feed-token'

export const dynamic = 'force-dynamic'

/**
 * H3.4: ICS calendar feed dla pracownika wewnętrznego.
 *
 * Endpoint: GET /api/internal/calendar.ics?token=<opaque-256-bit-token>
 *
 * Subskrypcja w Google Calendar/Outlook:
 *   webcal://compass.dynaminds.pl/api/internal/calendar.ics?token=<opaque-token>
 *
 * Zawiera:
 *  - Zatwierdzone urlopy (vacation, sick_leave, parental, unpaid, training, other) z bieżącego i następnego roku
 *  - Timesheet entries (ostatnie 90 dni + nadchodzące, dla referencji)
 *  - Polskie święta państwowe
 */
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
        return calendarError('Unauthorized', 401)
    }
    if (isLegacyCalendarUserId(token)) {
        return calendarError('Gone', 410)
    }
    if (!isCalendarFeedToken(token)) {
        return calendarError('Unauthorized', 401)
    }

    const admin = createServiceClient()
    const tokenHash = hashCalendarFeedToken(token)
    const { data: tokenRow, error: tokenError } = await admin
        .from('calendar_feed_tokens')
        .select('user_id')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .maybeSingle()

    if (tokenError) {
        return calendarError('Service unavailable', 503)
    }
    if (!tokenRow) {
        return calendarError('Unauthorized', 401)
    }

    const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, full_name, email, role, employment_status, is_external')
        .eq('id', tokenRow.user_id)
        .maybeSingle<{
            id: string
            full_name: string | null
            email: string
            role: string
            employment_status: string
            is_external: boolean
        }>()

    if (profileError) {
        return calendarError('Service unavailable', 503)
    }
    if (
        !profile
        || !['internal', 'admin', 'finanse', 'manager', 'talent_community'].includes(profile.role)
        || !['active', 'onboarding'].includes(profile.employment_status)
        || profile.is_external
    ) {
        return calendarError('Unauthorized', 401)
    }

    const today = new Date()
    const yearStart = `${today.getFullYear()}-01-01`
    const nextYearEnd = `${today.getFullYear() + 1}-12-31`
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [leavesRes, timesheetEntriesRes, holidaysRes] = await Promise.all([
        admin
            .from('leave_requests')
            .select('id, start_date, end_date, leave_type, half_day, note')
            .eq('user_id', profile.id)
            .eq('status', 'approved')
            .gte('start_date', yearStart)
            .lte('end_date', nextYearEnd),
        admin
            .from('timesheet_entries')
            .select('id, work_date, hours, project, description, timesheet:timesheets!inner(user_id, status)')
            .gte('work_date', ninetyDaysAgo)
            .eq('timesheet.user_id', profile.id),
        admin
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', yearStart)
            .lte('date', nextYearEnd),
    ])

    if (leavesRes.error || timesheetEntriesRes.error || holidaysRes.error) {
        return calendarError('Service unavailable', 503)
    }

    // Re-check the exact hash at the end of the read. If a user rotated or
    // revoked the token while the feed was being assembled, the old request
    // must not receive the calendar and must not touch the replacement token.
    const { data: touchedToken, error: tokenTouchError } = await admin
        .from('calendar_feed_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .select('user_id')
        .maybeSingle()
    if (tokenTouchError) {
        return calendarError('Service unavailable', 503)
    }
    if (!touchedToken) {
        return calendarError('Unauthorized', 401)
    }

    const events: string[] = []
    const dtstamp = formatICSDate(new Date())

    const userLabel = profile.full_name ?? profile.email

    // Leave events (multi-day, all-day)
    type LeaveRow = {
        id: string
        start_date: string
        end_date: string
        leave_type: string
        half_day: 'morning' | 'afternoon' | null
        note: string | null
    }
    for (const l of (leavesRes.data ?? []) as LeaveRow[]) {
        const typeLabel = LEAVE_TYPE_PL[l.leave_type] ?? l.leave_type
        const summary = l.half_day
            ? `${typeLabel} (1/2 dnia ${l.half_day === 'morning' ? 'rano' : 'popoł.'}) — ${userLabel}`
            : `${typeLabel} — ${userLabel}`
        const description = l.note ?? ''
        events.push(
            buildEvent({
                uid: `leave-${l.id}@compass.dynaminds.pl`,
                dtstamp,
                summary: escapeText(summary),
                description: escapeText(description),
                dtstart: l.start_date.replace(/-/g, ''),
                // ICS DTEND for all-day is exclusive: add 1 day
                dtend: addOneDay(l.end_date),
                allDay: true,
            }),
        )
    }

    // Timesheet entries (single-day)
    type EntryRow = {
        id: string
        work_date: string
        hours: number
        project: string | null
        description: string
    }
    for (const e of (timesheetEntriesRes.data ?? []) as EntryRow[]) {
        const summary = `🕐 ${e.hours}h — ${e.project ?? 'Praca'}`
        events.push(
            buildEvent({
                uid: `entry-${e.id}@compass.dynaminds.pl`,
                dtstamp,
                summary: escapeText(summary),
                description: escapeText(e.description),
                dtstart: e.work_date.replace(/-/g, ''),
                dtend: addOneDay(e.work_date),
                allDay: true,
            }),
        )
    }

    // Public holidays (read-only context)
    type HolidayRow = { date: string; name_pl: string }
    for (const h of (holidaysRes.data ?? []) as HolidayRow[]) {
        events.push(
            buildEvent({
                uid: `holiday-${h.date}@compass.dynaminds.pl`,
                dtstamp,
                summary: escapeText(`🇵🇱 ${h.name_pl}`),
                description: 'Święto państwowe',
                dtstart: h.date.replace(/-/g, ''),
                dtend: addOneDay(h.date),
                allDay: true,
            }),
        )
    }

    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//COMPASS//HR Internal Calendar//PL',
        'CALSCALE:GREGORIAN',
        `X-WR-CALNAME:COMPASS — ${userLabel}`,
        'X-WR-TIMEZONE:Europe/Warsaw',
        ...events,
        'END:VCALENDAR',
    ].join('\r\n')

    return new NextResponse(ics, {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="compass.ics"',
            'Cache-Control': 'private, no-store',
        },
    })
}

function calendarError(message: string, status: 401 | 410 | 503): NextResponse {
    return new NextResponse(message, {
        status,
        headers: {
            'Cache-Control': 'private, no-store',
            ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
            ...(status === 503 ? { 'Retry-After': '5' } : {}),
        },
    })
}

const LEAVE_TYPE_PL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4 / chorobowe',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    on_demand: 'Urlop na żądanie',
    occasional: 'Urlop okolicznościowy',
    childcare: 'Opieka nad dzieckiem (art. 188)',
    care_leave: 'Urlop opiekuńczy',
    force_majeure: 'Siła wyższa',
    maternity: 'Urlop macierzyński',
    paternity: 'Urlop ojcowski',
    childrearing: 'Urlop wychowawczy',
    blood_donation: 'Krwiodawstwo',
    holiday_in_lieu: 'Odbiór dnia za święto',
    other: 'Inne',
}

function formatICSDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) +
        'Z'
    )
}

function addOneDay(isoDate: string): string {
    const d = new Date(isoDate + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return (
        d.getUTCFullYear().toString() +
        String(d.getUTCMonth() + 1).padStart(2, '0') +
        String(d.getUTCDate()).padStart(2, '0')
    )
}

function escapeText(s: string): string {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n')
}

function buildEvent(args: {
    uid: string
    dtstamp: string
    summary: string
    description: string
    dtstart: string
    dtend: string
    allDay: boolean
}): string {
    return [
        'BEGIN:VEVENT',
        `UID:${args.uid}`,
        `DTSTAMP:${args.dtstamp}`,
        args.allDay ? `DTSTART;VALUE=DATE:${args.dtstart}` : `DTSTART:${args.dtstart}`,
        args.allDay ? `DTEND;VALUE=DATE:${args.dtend}` : `DTEND:${args.dtend}`,
        `SUMMARY:${args.summary}`,
        args.description ? `DESCRIPTION:${args.description}` : '',
        'END:VEVENT',
    ]
        .filter(Boolean)
        .join('\r\n')
}
