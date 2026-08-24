// Phase 11: working-day calculation for HR module.
// Working day = Mon-Fri AND not in public_holidays.

import { addDays, eachDayOfInterval, endOfMonth, format, isWeekend, parseISO, startOfMonth } from 'date-fns'

export interface PublicHolidayDate {
    date: string
    name_pl: string
}

export function isWorkingDay(date: Date, holidays: ReadonlyArray<PublicHolidayDate>): boolean {
    if (isWeekend(date)) return false
    const iso = format(date, 'yyyy-MM-dd')
    return !holidays.some((h) => h.date === iso)
}

export function workingDaysInMonth(
    year: number,
    month: number,
    holidays: ReadonlyArray<PublicHolidayDate>,
): Date[] {
    const start = startOfMonth(new Date(year, month - 1, 1))
    const end = endOfMonth(start)
    return eachDayOfInterval({ start, end }).filter((d) => isWorkingDay(d, holidays))
}

export function workingDaysBetween(
    startDate: Date,
    endDate: Date,
    holidays: ReadonlyArray<PublicHolidayDate>,
): Date[] {
    return eachDayOfInterval({ start: startDate, end: endDate }).filter((d) =>
        isWorkingDay(d, holidays),
    )
}

/**
 * Phase 53 — first working day strictly AFTER `dateISO` (YYYY-MM-DD).
 * With an empty holidays list it degrades to weekend-only skipping.
 * Bounded to 366 steps as a defensive cap — a year of non-working days means
 * broken data, not a calendar; the fallback is simply the next calendar day.
 */
export function nextWorkingDayAfter(
    dateISO: string,
    holidays: ReadonlyArray<PublicHolidayDate>,
): string {
    let d = addDays(parseISO(dateISO), 1)
    for (let i = 0; i < 366; i++) {
        if (isWorkingDay(d, holidays)) return format(d, 'yyyy-MM-dd')
        d = addDays(d, 1)
    }
    return format(addDays(parseISO(dateISO), 1), 'yyyy-MM-dd')
}
