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

export interface PaidUnpaidSplit {
    paid: number
    unpaid: number
}

/**
 * Phase 30 — split a leave request into paid (drawn from pool) and unpaid days.
 *
 * Behavior per employment_type:
 *   - UoP: pool jest hard-limit (Phase 27k walidacja blokuje overflow przed insertem).
 *     Tu zawsze paid=requested, unpaid=0 (jeśli caller doszedł tutaj, pula starcza).
 *     UoP bez puli (entitlement IS NULL) = unlimited → paid=requested, unpaid=0.
 *   - B2B/zlecenie z pulą: paid = min(requested, remaining), unpaid = requested - paid.
 *     Auto-split w jednym leave_request (B2B/zlecenie nie mają osobnego unpaid_leave —
 *     PR #179 blokuje wszystko poza vacation).
 *   - B2B/zlecenie bez puli: paid=0, unpaid=requested. Historyczna semantyka.
 *
 * Half-day (0.5) jest atomowy — jeśli pool < 0.5, całe pół dnia idzie na unpaid
 * (nie splitujemy fractional half-day).
 */
export function computePaidUnpaidSplit(args: {
    employmentType: string | null
    entitlementDays: number | null
    carriedOverDays: number
    usedInitialDays: number
    alreadyBookedDaysInYear: number
    requestedWorkingDays: number
}): PaidUnpaidSplit {
    const requested = args.requestedWorkingDays
    if (requested <= 0) return { paid: 0, unpaid: 0 }

    const isContractor = args.employmentType === 'b2b' || args.employmentType === 'zlecenie'
    const hasPool = args.entitlementDays != null

    // UoP: caller już zwalidował hard-limit. Zawsze paid=requested.
    if (!isContractor) {
        return { paid: round1(requested), unpaid: 0 }
    }

    // B2B/zlecenie bez puli: cały wniosek bezpłatny.
    if (!hasPool) {
        return { paid: 0, unpaid: round1(requested) }
    }

    // B2B/zlecenie z pulą: auto-split.
    const remaining =
        (args.entitlementDays as number)
        + args.carriedOverDays
        - args.usedInitialDays
        - args.alreadyBookedDaysInYear
    const available = Math.max(0, remaining)

    // Half-day atomowy: jeśli pool < 0.5, całe pół dnia bezpłatne.
    if (requested === 0.5) {
        return available >= 0.5 ? { paid: 0.5, unpaid: 0 } : { paid: 0, unpaid: 0.5 }
    }

    const paid = Math.min(requested, available)
    const unpaid = requested - paid
    return { paid: round1(paid), unpaid: round1(unpaid) }
}

function round1(n: number): number {
    return Number(n.toFixed(1))
}
