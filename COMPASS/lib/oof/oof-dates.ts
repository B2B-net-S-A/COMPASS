// Phase 36 — pure date logic for reverse Outlook OOF → Compass sync.
//
// Two pure, deterministic helpers (no DB, no Date.now) so they are easily unit
// tested:
//   - oofScheduledToDates: Graph scheduled OOF window → inclusive Warsaw date range
//   - computeMissingRuns:  OOF range minus weekends/holidays/existing leaves →
//                          contiguous runs of uncovered working days
//
// Imports stay relative (matches lib/hr/leave-timesheet-split.ts) so the test
// suite does not depend on the `@/` path alias being configured in vitest.

import { eachDayOfInterval, parseISO, format, addDays } from 'date-fns'
import { isWorkingDay, type PublicHolidayDate } from '../hr/working-days'
import type { LeaveSpan } from '../hr/leave-balance'

export interface OofDateRange {
    /** YYYY-MM-DD, inclusive. */
    startDate: string
    /** YYYY-MM-DD, inclusive. */
    endDate: string
}

interface GraphDateTime {
    dateTime: string
    timeZone?: string
}

const WARSAW_TZ = 'Europe/Warsaw'

function toInstant(dt: GraphDateTime | null | undefined): Date | null {
    if (!dt?.dateTime) return null
    // Graph returns scheduled OOF times in UTC in practice. For UTC append 'Z'.
    // For an explicit IANA zone we best-effort parse the wall-clock string as-is;
    // the resulting calendar date is still derived through Warsaw formatting below.
    const isUtc = (dt.timeZone ?? '').toUpperCase() === 'UTC'
    const d = new Date(isUtc ? `${dt.dateTime}Z` : dt.dateTime)
    return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Instant → calendar date (YYYY-MM-DD) as seen in Warsaw. Exported since Phase 41:
 * forwarding rules toggle exactly on day boundaries, so they must not derive "today"
 * from UTC (`toISOString().slice(0,10)`), which is off by one late in the evening.
 */
export function warsawDate(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: WARSAW_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d)
}

function warsawWallTime(d: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: WARSAW_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(d)
}

/**
 * Dzień startu liczy się jako urlop tylko, gdy OOF ruszył przed tą godziną (Warszawa).
 * Ludzie włączają autoresponder i przekierowanie pod koniec dnia pracy („od 16:30 piszcie
 * do Marcina”) — to nie jest dzień urlopu, a wcześniej trafiał do wniosku.
 */
const LATE_START_CUTOFF = '15:00'
/**
 * Dzień końca liczy się jako urlop tylko, gdy OOF trwa dłużej niż do tej godziny.
 * „Wracam w poniedziałek o 8:00” oznacza, że poniedziałek jest dniem pracy.
 */
const EARLY_END_CUTOFF = '09:00'

/**
 * Convert a scheduled OOF window (Graph automaticRepliesSetting.scheduled*DateTime)
 * into an inclusive Warsaw [startDate, endDate].
 *
 * Start rule: a start at or after LATE_START_CUTOFF skips that day (OOF switched on
 * after work, not a day off).
 *
 * End rule: an end at or before EARLY_END_CUTOFF is EXCLUSIVE. That covers Warsaw
 * midnight — Graph/Compass write `scheduledEndDateTime = lastDay + 1 @ 00:00` — and a
 * user-set "back at 08:00". Any later end time is inclusive (the employee is absent for
 * most of that day, e.g. "back at 16:00 on the 12th"). Returns null when unparseable or
 * when no whole day remains (e.g. OOF only for one evening).
 */
export function oofScheduledToDates(
    start: GraphDateTime | null | undefined,
    end: GraphDateTime | null | undefined,
): OofDateRange | null {
    const si = toInstant(start)
    const ei = toInstant(end)
    if (!si || !ei) return null
    let startDate = warsawDate(si)
    if (warsawWallTime(si) >= LATE_START_CUTOFF) {
        startDate = format(addDays(parseISO(startDate), 1), 'yyyy-MM-dd')
    }
    let endDate = warsawDate(ei)
    if (warsawWallTime(ei) <= EARLY_END_CUTOFF) {
        endDate = format(addDays(parseISO(endDate), -1), 'yyyy-MM-dd')
    }
    if (endDate < startDate) return null
    return { startDate, endDate }
}

/**
 * Given an OOF date range, the spans already covering the employee (approved/pending
 * leaves + previously-rejected OOF auto-requests), and public holidays, return the
 * contiguous runs of WORKING days inside the range that are NOT covered.
 *
 * Each run becomes one pending leave_request. Weekends/holidays never open or extend
 * a run and are skipped — so a missing Friday and the following Monday (with the
 * weekend between) collapse into a single Fri–Mon run, while a *covered* working day
 * in the middle splits the run in two.
 */
export function computeMissingRuns(
    range: OofDateRange,
    coveredSpans: ReadonlyArray<LeaveSpan>,
    holidays: ReadonlyArray<PublicHolidayDate>,
): OofDateRange[] {
    const start = parseISO(range.startDate)
    const end = parseISO(range.endDate)
    if (end < start) return []

    const covered = new Set<string>()
    for (const span of coveredSpans) {
        const ss = parseISO(span.start_date)
        const se = parseISO(span.end_date)
        if (se < ss) continue
        for (const d of eachDayOfInterval({ start: ss, end: se })) {
            covered.add(format(d, 'yyyy-MM-dd'))
        }
    }

    const runs: OofDateRange[] = []
    let runStart: string | null = null
    let runEnd: string | null = null
    const closeRun = () => {
        if (runStart && runEnd) runs.push({ startDate: runStart, endDate: runEnd })
        runStart = null
        runEnd = null
    }

    for (const d of eachDayOfInterval({ start, end })) {
        if (!isWorkingDay(d, holidays)) continue // weekend/holiday: ignore for run boundaries
        const iso = format(d, 'yyyy-MM-dd')
        if (covered.has(iso)) {
            closeRun()
            continue
        }
        if (!runStart) runStart = iso
        runEnd = iso
    }
    closeRun()
    return runs
}
