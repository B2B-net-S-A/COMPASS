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

function warsawDate(d: Date): string {
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
 * Convert a scheduled OOF window (Graph automaticRepliesSetting.scheduled*DateTime)
 * into an inclusive Warsaw [startDate, endDate].
 *
 * End rule: an end instant landing exactly on Warsaw midnight (00:00) is treated as
 * EXCLUSIVE — Graph/Compass write `scheduledEndDateTime = lastDay + 1 @ 00:00`, so
 * midnight means "up to but not including this day" → endDate = previous day. Any
 * other end time is inclusive (the employee is absent for part of that day, e.g. a
 * user-set "back at 16:00 on the 12th"). Returns null when unparseable.
 */
export function oofScheduledToDates(
    start: GraphDateTime | null | undefined,
    end: GraphDateTime | null | undefined,
): OofDateRange | null {
    const si = toInstant(start)
    const ei = toInstant(end)
    if (!si || !ei) return null
    const startDate = warsawDate(si)
    let endDate = warsawDate(ei)
    if (warsawWallTime(ei) === '00:00') {
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
