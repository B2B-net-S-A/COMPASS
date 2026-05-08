import { describe, expect, it } from 'vitest'
import { isWorkingDay, workingDaysBetween, workingDaysInMonth } from '../working-days'

const HOLIDAYS = [
    { date: '2026-05-01', name_pl: 'Święto Pracy' },
    { date: '2026-05-03', name_pl: 'Konstytucji 3 Maja' },
]

describe('isWorkingDay', () => {
    it('returns true for a weekday that is not a holiday', () => {
        expect(isWorkingDay(new Date('2026-05-04T12:00:00Z'), HOLIDAYS)).toBe(true)
    })

    it('returns false for a Saturday', () => {
        expect(isWorkingDay(new Date('2026-05-02T12:00:00Z'), HOLIDAYS)).toBe(false)
    })

    it('returns false for a Sunday', () => {
        expect(isWorkingDay(new Date('2026-05-03T12:00:00Z'), HOLIDAYS)).toBe(false)
    })

    it('returns false for a holiday on a weekday', () => {
        // 2026-05-01 is a Friday in this timezone but happens to be holiday
        expect(isWorkingDay(new Date('2026-05-01T12:00:00Z'), HOLIDAYS)).toBe(false)
    })
})

describe('workingDaysInMonth', () => {
    it('counts Mon-Fri minus holidays', () => {
        const days = workingDaysInMonth(2026, 5, HOLIDAYS)
        // May 2026: 31 days, Saturdays/Sundays remove ~10, May 1 holiday removes another
        expect(days.length).toBeGreaterThan(15)
        expect(days.length).toBeLessThan(23)
        // No weekend in result
        for (const d of days) {
            expect(d.getDay()).not.toBe(0)
            expect(d.getDay()).not.toBe(6)
        }
    })
})

describe('workingDaysBetween', () => {
    it('inclusive range, excludes weekends and holidays', () => {
        const days = workingDaysBetween(
            new Date(2026, 4, 1), // 2026-05-01 (Friday, holiday)
            new Date(2026, 4, 5), // 2026-05-05 (Tuesday)
            HOLIDAYS,
        )
        // 5/1 holiday OUT, 5/2 Sat OUT, 5/3 Sun + holiday OUT, 5/4 Mon IN, 5/5 Tue IN → 2
        expect(days.length).toBe(2)
    })
})
