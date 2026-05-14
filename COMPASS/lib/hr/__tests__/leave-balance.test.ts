import { describe, expect, it } from 'vitest'
import { totalVacationDaysUsed, workingDaysInLeave } from '../leave-balance'

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
})
