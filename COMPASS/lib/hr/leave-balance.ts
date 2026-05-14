// Phase 11: vacation balance calculation.
// Counts working days inside leave_requests of type='vacation' (or other types
// when caller wants), respecting half-day flag (= 0.5 day on a single workday).

import { eachDayOfInterval, parseISO } from 'date-fns'
import { isWorkingDay, type PublicHolidayDate } from './working-days'

export interface LeaveSpan {
    start_date: string
    end_date: string
    half_day: 'morning' | 'afternoon' | null
    leave_type: string
}

export function workingDaysInLeave(
    span: LeaveSpan,
    holidays: ReadonlyArray<PublicHolidayDate>,
): number {
    const start = parseISO(span.start_date)
    const end = parseISO(span.end_date)
    const days = eachDayOfInterval({ start, end }).filter((d) => isWorkingDay(d, holidays))
    if (span.half_day && days.length === 1) return 0.5
    return days.length
}

/**
 * Count vacation days used (type='vacation' only). Other leave types do not
 * deduct from the annual pool in this MVP.
 */
export function totalVacationDaysUsed(
    spans: ReadonlyArray<LeaveSpan>,
    holidays: ReadonlyArray<PublicHolidayDate>,
): number {
    return spans
        .filter((s) => s.leave_type === 'vacation')
        .reduce((sum, s) => sum + workingDaysInLeave(s, holidays), 0)
}
