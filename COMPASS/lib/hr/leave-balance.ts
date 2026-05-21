// Phase 11 + 27k: vacation balance calculation.
// Counts working days inside vacation-pool leave_requests, respecting the half-day
// flag (= 0.5 day on a single workday). Phase 27k adds entitlement/remaining for UoP.

import { eachDayOfInterval, parseISO } from 'date-fns'
import { isWorkingDay, type PublicHolidayDate } from './working-days'

export interface LeaveSpan {
    start_date: string
    end_date: string
    half_day: 'morning' | 'afternoon' | null
    leave_type: string
}

/**
 * Phase 27k — leave types that draw from the annual paid-vacation pool (the 20/26
 * statutory days). "Urlop na żądanie" (on_demand) is part of the same pool.
 * All other types (sick, occasional, unpaid, parental, …) do NOT deduct from it.
 */
export const VACATION_POOL_TYPES = ['vacation', 'on_demand'] as const

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
 * Count days drawn from the vacation pool (vacation + on_demand). Other leave
 * types do not deduct from the annual entitlement.
 */
export function totalVacationDaysUsed(
    spans: ReadonlyArray<LeaveSpan>,
    holidays: ReadonlyArray<PublicHolidayDate>,
): number {
    const pool = VACATION_POOL_TYPES as readonly string[]
    return spans
        .filter((s) => pool.includes(s.leave_type))
        .reduce((sum, s) => sum + workingDaysInLeave(s, holidays), 0)
}

/**
 * Phase 27k — remaining paid-vacation days for a limited (UoP) employee.
 * remaining = entitlement + carried-over − used − approved-future.
 * May be negative if over-booked (UI should surface that).
 */
export function computeRemaining(
    entitlementDays: number,
    carriedOverDays: number,
    usedDays: number,
    approvedFutureDays: number,
): number {
    return Number((entitlementDays + carriedOverDays - usedDays - approvedFutureDays).toFixed(1))
}
