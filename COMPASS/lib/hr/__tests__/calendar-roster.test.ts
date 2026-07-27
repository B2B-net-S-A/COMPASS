import { describe, expect, it } from 'vitest'

import {
    filterCalendarRoster,
    isOnCalendarRosterForMonth,
} from '@/lib/hr/calendar-roster'

const JULY = '2026-07-01'
const JUNE = '2026-06-01'

describe('isOnCalendarRosterForMonth', () => {
    it('keeps an active employee with no termination date', () => {
        expect(
            isOnCalendarRosterForMonth({ employment_status: 'active', termination_date: null }, JULY),
        ).toBe(true)
    })

    it('hides someone who left before the displayed month', () => {
        expect(
            isOnCalendarRosterForMonth(
                { employment_status: 'exited', termination_date: '2026-06-30' },
                JULY,
            ),
        ).toBe(false)
    })

    it('still shows that person in the month they actually worked', () => {
        expect(
            isOnCalendarRosterForMonth(
                { employment_status: 'exited', termination_date: '2026-06-30' },
                JUNE,
            ),
        ).toBe(true)
    })

    it('keeps an offboarding employee through their final month', () => {
        expect(
            isOnCalendarRosterForMonth(
                { employment_status: 'offboarding', termination_date: '2026-07-27' },
                JULY,
            ),
        ).toBe(true)
    })

    it('drops that employee from the month after their last day', () => {
        expect(
            isOnCalendarRosterForMonth(
                { employment_status: 'offboarding', termination_date: '2026-07-27' },
                '2026-08-01',
            ),
        ).toBe(false)
    })

    it('keeps someone whose last day is exactly the 1st of the month', () => {
        expect(
            isOnCalendarRosterForMonth(
                { employment_status: 'offboarding', termination_date: '2026-07-01' },
                JULY,
            ),
        ).toBe(true)
    })

    it('hides a legacy exited row that has no termination date', () => {
        expect(
            isOnCalendarRosterForMonth({ employment_status: 'exited', termination_date: null }, JULY),
        ).toBe(false)
    })

    it('keeps a row with no employment data at all (defensive default)', () => {
        expect(isOnCalendarRosterForMonth({}, JULY)).toBe(true)
    })
})

describe('filterCalendarRoster', () => {
    it('removes only the people gone before the month started', () => {
        const roster = [
            { id: 'active', employment_status: 'active', termination_date: null },
            { id: 'leaving', employment_status: 'offboarding', termination_date: '2026-07-27' },
            { id: 'gone', employment_status: 'exited', termination_date: '2026-06-30' },
        ]

        expect(filterCalendarRoster(roster, JULY).map((m) => m.id)).toEqual(['active', 'leaving'])
    })
})
