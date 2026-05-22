import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * H3.4: ICS calendar feed dla pracownika wewnętrznego.
 *
 * Endpoint: GET /api/internal/calendar.ics?token=<user_id>
 * (W przyszłości: token = signed JWT z user_id + scope. Na MVP: user_id direct,
 * dane zwracane są user-own only.)
 *
 * Subskrypcja w Google Calendar/Outlook:
 *   webcal://compass.dynaminds.pl/api/internal/calendar.ics?token=<user_id>
 *
 * Zawiera:
 *  - Zatwierdzone urlopy (vacation, sick_leave, parental, unpaid, training, other) z bieżącego i następnego roku
 *  - Timesheet entries (ostatnie 90 dni + nadchodzące, dla referencji)
 *  - Polskie święta państwowe
 */
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
        return new NextResponse('Missing token', { status: 400 })
    }

    const admin = createServiceClient()
    const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', token)
        .single<{ id: string; full_name: string | null; email: string; role: string }>()

    if (!profile || !['internal', 'admin'].includes(profile.role)) {
        return new NextResponse('Invalid token', { status: 401 })
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
            'Cache-Control': 'private, max-age=900', // 15 min
        },
    })
}

const LEAVE_TYPE_PL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4 / chorobowe',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
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
