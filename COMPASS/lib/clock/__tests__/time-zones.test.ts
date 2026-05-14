import { describe, expect, it } from 'vitest'
import {
    assertIsoDate,
    current5MinBucketIso,
    getDayIsoRange,
    getMonthDateRange,
    getMonthIsoRange,
    isValidIsoDate,
    todayIsoDate,
} from '../time-zones'

describe('isValidIsoDate', () => {
    it('accepts YYYY-MM-DD', () => {
        expect(isValidIsoDate('2026-05-11')).toBe(true)
        expect(isValidIsoDate('2000-01-01')).toBe(true)
    })

    it('rejects other formats', () => {
        expect(isValidIsoDate('2026-5-11')).toBe(false)
        expect(isValidIsoDate('11-05-2026')).toBe(false)
        expect(isValidIsoDate('2026/05/11')).toBe(false)
        expect(isValidIsoDate('')).toBe(false)
        expect(isValidIsoDate('2026-05-11T00:00:00Z')).toBe(false)
    })

    it('handles non-string inputs gracefully', () => {
        // @ts-expect-error testing runtime resilience
        expect(isValidIsoDate(undefined)).toBe(false)
        // @ts-expect-error testing runtime resilience
        expect(isValidIsoDate(null)).toBe(false)
        // @ts-expect-error testing runtime resilience
        expect(isValidIsoDate(20260511)).toBe(false)
    })
})

describe('assertIsoDate', () => {
    it('passes for valid input', () => {
        expect(() => assertIsoDate('2026-05-11')).not.toThrow()
    })

    it('throws for invalid input', () => {
        expect(() => assertIsoDate('11-05-2026')).toThrow(/YYYY-MM-DD/)
        expect(() => assertIsoDate('')).toThrow(/YYYY-MM-DD/)
    })
})

describe('todayIsoDate', () => {
    it('formats provided Date as YYYY-MM-DD', () => {
        expect(todayIsoDate(new Date(2026, 4, 11, 12, 30))).toBe('2026-05-11')
    })

    it('zero-pads month and day', () => {
        expect(todayIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    })
})

describe('getMonthDateRange', () => {
    it('returns first and last day of the month', () => {
        expect(getMonthDateRange(2026, 5)).toEqual({
            start: '2026-05-01',
            end: '2026-05-31',
        })
    })

    it('handles February in a non-leap year', () => {
        expect(getMonthDateRange(2026, 2)).toEqual({
            start: '2026-02-01',
            end: '2026-02-28',
        })
    })

    it('handles February in a leap year', () => {
        expect(getMonthDateRange(2024, 2)).toEqual({
            start: '2024-02-01',
            end: '2024-02-29',
        })
    })

    it('handles December rollover', () => {
        expect(getMonthDateRange(2026, 12)).toEqual({
            start: '2026-12-01',
            end: '2026-12-31',
        })
    })
})

describe('getMonthIsoRange', () => {
    it('appends T00:00:00Z to start and T23:59:59Z to end', () => {
        expect(getMonthIsoRange(2026, 5)).toEqual({
            startIso: '2026-05-01T00:00:00Z',
            endIso: '2026-05-31T23:59:59Z',
        })
    })
})

describe('getDayIsoRange', () => {
    it('expands a YYYY-MM-DD into a full UTC day range', () => {
        expect(getDayIsoRange('2026-05-11')).toEqual({
            startIso: '2026-05-11T00:00:00.000Z',
            endIso: '2026-05-11T23:59:59.999Z',
        })
    })

    it('throws on invalid input', () => {
        expect(() => getDayIsoRange('not-a-date')).toThrow(/YYYY-MM-DD/)
    })
})

describe('current5MinBucketIso', () => {
    it('floors to the nearest 5-minute boundary', () => {
        // 12:07:23 → 12:05:00
        const nowMs = new Date('2026-05-11T12:07:23.456Z').getTime()
        expect(current5MinBucketIso(nowMs)).toBe('2026-05-11T12:05:00.000Z')
    })

    it('preserves exact boundary values', () => {
        const nowMs = new Date('2026-05-11T12:05:00.000Z').getTime()
        expect(current5MinBucketIso(nowMs)).toBe('2026-05-11T12:05:00.000Z')
    })

    it('handles boundary just below the next bucket', () => {
        const nowMs = new Date('2026-05-11T12:09:59.999Z').getTime()
        expect(current5MinBucketIso(nowMs)).toBe('2026-05-11T12:05:00.000Z')
    })

    it('uses Date.now() by default', () => {
        const out = current5MinBucketIso()
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/)
        // The minute portion must be divisible by 5
        const minute = Number(out.slice(14, 16))
        expect(minute % 5).toBe(0)
    })
})
