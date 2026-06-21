import { describe, expect, it } from 'vitest'
import {
    totalVacationDaysUsed,
    workingDaysInLeave,
    computeRemaining,
    computePaidUnpaidSplit,
    VACATION_POOL_TYPES,
} from '../leave-balance'

const HOLIDAYS = [{ date: '2026-05-01', name_pl: 'Święto Pracy' }]

describe('workingDaysInLeave', () => {
    it('counts working days inclusively', () => {
        const span = {
            start_date: '2026-05-04',
            end_date: '2026-05-08',
            half_day: null,
            leave_type: 'vacation',
        }
        // Mon-Fri in May 2026 (4-8) minus 0 holidays in this range = 5 days
        expect(workingDaysInLeave(span, HOLIDAYS)).toBe(5)
    })

    it('excludes weekends', () => {
        const span = {
            start_date: '2026-05-02',
            end_date: '2026-05-03',
            half_day: null,
            leave_type: 'vacation',
        }
        expect(workingDaysInLeave(span, HOLIDAYS)).toBe(0)
    })

    it('excludes holidays', () => {
        const span = {
            start_date: '2026-04-30',
            end_date: '2026-05-04',
            half_day: null,
            leave_type: 'vacation',
        }
        // 4/30 (Thu), 5/1 (Fri holiday), 5/2 (Sat), 5/3 (Sun), 5/4 (Mon) → 2 working
        expect(workingDaysInLeave(span, HOLIDAYS)).toBe(2)
    })

    it('returns 0.5 for single-day half-day leave', () => {
        const span = {
            start_date: '2026-05-04',
            end_date: '2026-05-04',
            half_day: 'morning' as const,
            leave_type: 'vacation',
        }
        expect(workingDaysInLeave(span, HOLIDAYS)).toBe(0.5)
    })
})

describe('totalVacationDaysUsed', () => {
    it('sums only vacation leaves', () => {
        const spans = [
            { start_date: '2026-05-04', end_date: '2026-05-05', half_day: null, leave_type: 'vacation' },
            { start_date: '2026-06-01', end_date: '2026-06-03', half_day: null, leave_type: 'sick_leave' },
            { start_date: '2026-07-01', end_date: '2026-07-01', half_day: null, leave_type: 'vacation' },
        ]
        // 2 + 1 = 3 (ignoring sick)
        expect(totalVacationDaysUsed(spans, HOLIDAYS)).toBe(3)
    })

    it('counts on_demand toward the vacation pool (Phase 27k)', () => {
        const spans = [
            { start_date: '2026-05-04', end_date: '2026-05-05', half_day: null, leave_type: 'vacation' }, // 2
            { start_date: '2026-05-06', end_date: '2026-05-06', half_day: null, leave_type: 'on_demand' }, // 1 (Wed)
            { start_date: '2026-05-07', end_date: '2026-05-07', half_day: null, leave_type: 'occasional' }, // ignored
        ]
        expect(totalVacationDaysUsed(spans, HOLIDAYS)).toBe(3)
    })
})

describe('VACATION_POOL_TYPES', () => {
    it('contains vacation and on_demand only', () => {
        expect([...VACATION_POOL_TYPES].sort()).toEqual(['on_demand', 'vacation'])
    })
})

describe('computeRemaining (Phase 27k)', () => {
    it('remaining = entitlement + carried − used − approvedFuture', () => {
        expect(computeRemaining(26, 5, 10, 4)).toBe(17)
    })
    it('goes negative when over-booked', () => {
        expect(computeRemaining(26, 0, 20, 10)).toBe(-4)
    })
    it('handles half-day fractions', () => {
        expect(computeRemaining(20, 0, 10.5, 0)).toBe(9.5)
    })
})

describe('computePaidUnpaidSplit (Phase 30)', () => {
    it('B2B/zlecenie bez puli → cały wniosek bezpłatny', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: null,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 0,
                requestedWorkingDays: 5,
            }),
        ).toEqual({ paid: 0, unpaid: 5 })
    })

    it('zlecenie bez puli → cały wniosek bezpłatny (analogicznie do B2B)', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'zlecenie',
                entitlementDays: null,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 0,
                requestedWorkingDays: 3,
            }),
        ).toEqual({ paid: 0, unpaid: 3 })
    })

    it('UoP zawsze paid=requested (hard-limit walidowany wcześniej)', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'uop',
                entitlementDays: 26,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 5,
                requestedWorkingDays: 10,
            }),
        ).toEqual({ paid: 10, unpaid: 0 })
    })

    it('UoP bez puli (unlimited) → paid=requested', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'uop',
                entitlementDays: null,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 0,
                requestedWorkingDays: 7,
            }),
        ).toEqual({ paid: 7, unpaid: 0 })
    })

    it('B2B z pulą, wniosek mieści się → wszystko płatne', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 0,
                usedInitialDays: 3,
                alreadyBookedDaysInYear: 2,
                requestedWorkingDays: 5,
            }),
        ).toEqual({ paid: 5, unpaid: 0 }) // remaining=15, requested=5
    })

    it('B2B z pulą, wniosek przekracza → auto-split', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 17,
                requestedWorkingDays: 10,
            }),
        ).toEqual({ paid: 3, unpaid: 7 }) // remaining=3, requested=10
    })

    it('B2B z pulą wyczerpaną → cały wniosek bezpłatny', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 20,
                requestedWorkingDays: 5,
            }),
        ).toEqual({ paid: 0, unpaid: 5 })
    })

    it('B2B z carried_over i used_initial → liczy poprawnie', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 5,
                usedInitialDays: 3,
                alreadyBookedDaysInYear: 10,
                requestedWorkingDays: 8,
            }),
        ).toEqual({ paid: 8, unpaid: 0 }) // remaining = 20+5-3-10 = 12, req=8 → all paid
    })

    it('B2B half-day z pulą ≥ 0.5 → płatne', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 19,
                requestedWorkingDays: 0.5,
            }),
        ).toEqual({ paid: 0.5, unpaid: 0 }) // remaining=1, requested=0.5
    })

    it('B2B half-day z pulą < 0.5 → atomowy, całe bezpłatne', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 19.8,
                requestedWorkingDays: 0.5,
            }),
        ).toEqual({ paid: 0, unpaid: 0.5 }) // remaining=0.2 < 0.5 → all unpaid
    })

    it('B2B z over-booked pulą (negative remaining) → wszystko bezpłatne', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 25, // already over
                requestedWorkingDays: 3,
            }),
        ).toEqual({ paid: 0, unpaid: 3 })
    })

    it('requested = 0 → 0/0', () => {
        expect(
            computePaidUnpaidSplit({
                employmentType: 'b2b',
                entitlementDays: 20,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 0,
                requestedWorkingDays: 0,
            }),
        ).toEqual({ paid: 0, unpaid: 0 })
    })
})
