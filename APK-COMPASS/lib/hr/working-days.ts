// Phase 11: working-day calculation for HR module.
// Working day = Mon-Fri AND not in public_holidays.

import { eachDayOfInterval, endOfMonth, format, isWeekend, startOfMonth } from 'date-fns'

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
