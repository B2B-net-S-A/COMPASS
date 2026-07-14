import { describe, expect, it } from 'vitest'
import {
    CHECK_IN_MILESTONES,
    TCM_DELIVERY_CHANNELS,
    addCalendarDays,
    deferPastQuietHours,
    deliveryDedupeKey,
    dueMilestones,
    isQuietHours,
    isLowPulseResponse,
    latestReachedMilestone,
    latestRecurrenceOnOrBefore,
    localBusinessTimeToUtc,
    localDate,
    parseBooleanEnv,
    recurrenceDates,
    retryDecision,
} from '../scheduling'

describe('consultant-success scheduling', () => {
    it('does calendar arithmetic without DST drift', () => {
        expect(addCalendarDays('2026-03-28', 2)).toBe('2026-03-30')
        expect(localDate(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30')
    })

    it('returns only due milestones inside the catch-up window', () => {
        expect(dueMilestones('2026-07-10', '2026-07-14', CHECK_IN_MILESTONES, 14))
            .toEqual([
                { key: 'pre3', offsetDays: -3, triggerDate: '2026-07-07' },
                { key: 'due', offsetDays: 0, triggerDate: '2026-07-10' },
                { key: 'overdue2', offsetDays: 2, triggerDate: '2026-07-12' },
            ])
    })

    it('bounds recurrence catch-up and materialises the planning horizon', () => {
        expect(recurrenceDates({
            firstDueDate: '2026-04-01',
            intervalDays: 30,
            today: '2026-07-14',
            catchUpDays: 14,
            horizonDays: 45,
        })).toEqual(['2026-06-30', '2026-07-30'])
        expect(latestRecurrenceOnOrBefore({
            firstDueDate: '2026-03-01',
            intervalDays: 60,
            today: '2026-07-14',
        })).toBe('2026-06-29')
    })

    it('uses only the latest reached milestone during catch-up', () => {
        expect(latestReachedMilestone('2026-07-01', '2026-07-14', CHECK_IN_MILESTONES))
            .toEqual({ key: 'overdue7', offsetDays: 7, triggerDate: '2026-07-08' })
        expect(latestReachedMilestone('2026-07-16', '2026-07-14', CHECK_IN_MILESTONES))
            .toEqual({ key: 'pre3', offsetDays: -3, triggerDate: '2026-07-13' })
    })

    it('uses Warsaw quiet hours across summer time', () => {
        expect(isQuietHours(new Date('2026-07-14T17:00:00Z'))).toBe(true) // 19:00 CEST
        expect(isQuietHours(new Date('2026-07-15T05:59:00Z'))).toBe(true) // 07:59 CEST
        expect(isQuietHours(new Date('2026-07-15T06:00:00Z'))).toBe(false) // 08:00 CEST
        expect(deferPastQuietHours(new Date('2026-07-15T05:57:00Z')).toISOString())
            .toBe('2026-07-15T06:00:00.000Z')
        expect(localBusinessTimeToUtc('2026-07-15', 9).toISOString())
            .toBe('2026-07-15T07:00:00.000Z')
        expect(localBusinessTimeToUtc('2026-01-15', 9).toISOString())
            .toBe('2026-01-15T08:00:00.000Z')
    })

    it('applies durable retry delays and eventually dead-letters', () => {
        const now = new Date('2026-07-14T10:00:00Z')
        expect(retryDecision(1, now)).toEqual({
            status: 'retry',
            availableAt: '2026-07-14T10:05:00.000Z',
        })
        expect(retryDecision(4, now).availableAt).toBe('2026-07-14T22:00:00.000Z')
        expect(retryDecision(5, now)).toEqual({ status: 'dead', availableAt: null })
    })

    it('parses feature flags and creates stable dedupe keys', () => {
        expect(parseBooleanEnv('YES')).toBe(true)
        expect(parseBooleanEnv(undefined, true)).toBe(true)
        expect(deliveryDedupeKey(['checkin', 'id-1', 'pre3', null])).toBe('checkin:id-1:pre3')
        expect(TCM_DELIVERY_CHANNELS).toEqual(['in_app', 'email', 'push'])
        expect(isLowPulseResponse({ satisfactionScore: 4, engagementScore: 5, recommendationScore: 10 }))
            .toBe(true)
        expect(isLowPulseResponse({ satisfactionScore: 9, engagementScore: 3, recommendationScore: 8 }))
            .toBe(false)
    })
})
