import { describe, it, expect } from 'vitest'
import {
    planForwardRuleEdit,
    shouldForwardBeActive,
    warsawToday,
    warsawTomorrow,
    type ForwardWindowLeave,
} from '../forward-window'

// 2026-07-20 12:00 Warsaw (summer, UTC+2).
const NOW = new Date('2026-07-20T10:00:00Z')

function leave(overrides: Partial<ForwardWindowLeave> = {}): ForwardWindowLeave {
    return {
        status: 'approved',
        substituteId: 'sub-1',
        startDate: '2026-07-20',
        endDate: '2026-07-24',
        ...overrides,
    }
}

describe('warsawToday / warsawTomorrow', () => {
    it('derives Warsaw calendar dates, not UTC ones', () => {
        expect(warsawToday(NOW)).toBe('2026-07-20')
        expect(warsawTomorrow(NOW)).toBe('2026-07-21')
    })

    it('late evening UTC is already the next day in Warsaw (summer, UTC+2)', () => {
        // 22:30Z = 00:30 next day in Warsaw. Deriving "today" from toISOString()
        // would yield 07-20 and open/close the window a day late.
        const lateEvening = new Date('2026-07-20T22:30:00Z')
        expect(warsawToday(lateEvening)).toBe('2026-07-21')
        expect(warsawTomorrow(lateEvening)).toBe('2026-07-22')
    })

    it('late evening UTC is already the next day in Warsaw (winter, UTC+1)', () => {
        const lateEvening = new Date('2026-01-15T23:30:00Z')
        expect(warsawToday(lateEvening)).toBe('2026-01-16')
        expect(warsawTomorrow(lateEvening)).toBe('2026-01-17')
    })

    it('rolls over the year correctly', () => {
        const newYearsEve = new Date('2026-12-31T23:30:00Z')
        expect(warsawToday(newYearsEve)).toBe('2027-01-01')
        expect(warsawTomorrow(newYearsEve)).toBe('2027-01-02')
    })

    it('survives the spring DST transition (29.03.2026, 02:00 -> 03:00)', () => {
        const beforeJump = new Date('2026-03-29T00:30:00Z') // 01:30 Warsaw, still UTC+1
        expect(warsawToday(beforeJump)).toBe('2026-03-29')
        expect(warsawTomorrow(beforeJump)).toBe('2026-03-30')

        const afterJump = new Date('2026-03-29T01:30:00Z') // 03:30 Warsaw, now UTC+2
        expect(warsawToday(afterJump)).toBe('2026-03-29')
        expect(warsawTomorrow(afterJump)).toBe('2026-03-30')
    })

    it('survives the autumn DST transition (25.10.2026)', () => {
        const duringFallBack = new Date('2026-10-25T00:30:00Z') // 02:30 Warsaw
        expect(warsawToday(duringFallBack)).toBe('2026-10-25')
        expect(warsawTomorrow(duringFallBack)).toBe('2026-10-26')
    })
})

describe('shouldForwardBeActive', () => {
    it('is active on a day inside the leave', () => {
        expect(shouldForwardBeActive(leave(), NOW)).toBe(true)
    })

    it('opens a day EARLY so the first morning of the leave is covered', () => {
        // Cron runs 06:00 UTC; opening on the first day would miss 00:00-08:00 Warsaw.
        const startsTomorrow = leave({ startDate: '2026-07-21', endDate: '2026-07-25' })
        expect(shouldForwardBeActive(startsTomorrow, NOW)).toBe(true)
    })

    it('is not active two days before the leave', () => {
        const startsLater = leave({ startDate: '2026-07-22', endDate: '2026-07-25' })
        expect(shouldForwardBeActive(startsLater, NOW)).toBe(false)
    })

    it('is active on the last day of the leave', () => {
        const endsToday = leave({ startDate: '2026-07-15', endDate: '2026-07-20' })
        expect(shouldForwardBeActive(endsToday, NOW)).toBe(true)
    })

    it('is not active the day after the leave ended', () => {
        const endedYesterday = leave({ startDate: '2026-07-15', endDate: '2026-07-19' })
        expect(shouldForwardBeActive(endedYesterday, NOW)).toBe(false)
    })

    it('covers a single-day leave that is today', () => {
        const oneDay = leave({ startDate: '2026-07-20', endDate: '2026-07-20' })
        expect(shouldForwardBeActive(oneDay, NOW)).toBe(true)
    })

    it('requires an approved leave', () => {
        for (const status of ['pending', 'rejected', 'cancelled']) {
            expect(shouldForwardBeActive(leave({ status }), NOW)).toBe(false)
        }
    })

    it('requires a substitute — no substitute means nobody to forward to', () => {
        expect(shouldForwardBeActive(leave({ substituteId: null }), NOW)).toBe(false)
    })

    it('ignores rows with missing dates instead of throwing', () => {
        expect(shouldForwardBeActive(leave({ startDate: '' }), NOW)).toBe(false)
        expect(shouldForwardBeActive(leave({ endDate: '' }), NOW)).toBe(false)
    })

    it('closes the window at Warsaw midnight, not UTC midnight', () => {
        // Leave ended 20.07. At 22:30Z it is already 21.07 in Warsaw, so the rule
        // must be considered stale — a UTC-derived "today" would keep it alive.
        const endedToday = leave({ startDate: '2026-07-18', endDate: '2026-07-20' })
        const lateEvening = new Date('2026-07-20T22:30:00Z')
        expect(shouldForwardBeActive(endedToday, lateEvening)).toBe(false)
    })
})

describe('planForwardRuleEdit', () => {
    const plan = (o: Partial<Parameters<typeof planForwardRuleEdit>[0]> = {}) =>
        planForwardRuleEdit({
            hasExistingRule: true,
            substituteChanged: false,
            datesChanged: false,
            forwardShouldExist: true,
            ...o,
        })

    it('does nothing when an active leave is edited but the rule is still correct', () => {
        // e.g. the manager only fixed the note — no reason to churn the mailbox.
        expect(plan()).toEqual({ close: false, open: false })
    })

    it('replaces the rule when the substitute changes', () => {
        // The critical one: without the close, mail keeps going to the OLD substitute.
        expect(plan({ substituteChanged: true })).toEqual({ close: true, open: true })
    })

    it('replaces the rule when the dates change', () => {
        expect(plan({ datesChanged: true })).toEqual({ close: true, open: true })
    })

    it('only closes when forwarding is no longer owed (substitute removed, leave moved to the past)', () => {
        expect(plan({ forwardShouldExist: false })).toEqual({ close: true, open: false })
        expect(plan({ substituteChanged: true, forwardShouldExist: false })).toEqual({
            close: true,
            open: false,
        })
    })

    it('opens a rule when a substitute is added to a leave that is already running', () => {
        expect(plan({ hasExistingRule: false, substituteChanged: true })).toEqual({
            close: false,
            open: true,
        })
    })

    it('does nothing when there is no rule and none is owed', () => {
        expect(plan({ hasExistingRule: false, forwardShouldExist: false })).toEqual({
            close: false,
            open: false,
        })
    })

    it('never asks to close a rule that does not exist', () => {
        for (const forwardShouldExist of [true, false]) {
            for (const substituteChanged of [true, false]) {
                for (const datesChanged of [true, false]) {
                    const result = plan({
                        hasExistingRule: false,
                        forwardShouldExist,
                        substituteChanged,
                        datesChanged,
                    })
                    expect(result.close).toBe(false)
                }
            }
        }
    })
})
