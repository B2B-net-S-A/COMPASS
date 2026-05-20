import { describe, it, expect } from 'vitest'
import {
    firstDayOfNextMonth,
    addMonths,
    isFirstOfMonth,
    buildChangePoints,
    validateProgressionEntries,
    buildCopyEntries,
    RATE_MAX,
} from '../progression'
import type { RateProgressionEntry } from '@/lib/types/rates'

describe('firstDayOfNextMonth', () => {
    it('returns 1st of next month (UTC)', () => {
        expect(firstDayOfNextMonth(new Date(Date.UTC(2026, 4, 20)))).toBe('2026-06-01') // May → June
    })
    it('rolls over December → January of next year', () => {
        expect(firstDayOfNextMonth(new Date(Date.UTC(2026, 11, 31)))).toBe('2027-01-01')
    })
})

describe('addMonths', () => {
    it('adds within a year', () => {
        expect(addMonths('2026-06-01', 3)).toBe('2026-09-01')
    })
    it('rolls across a year boundary', () => {
        expect(addMonths('2026-11-01', 3)).toBe('2027-02-01')
    })
    it('handles a full 23-month horizon span', () => {
        expect(addMonths('2026-06-01', 23)).toBe('2028-05-01')
    })
})

describe('isFirstOfMonth', () => {
    it('accepts YYYY-MM-01', () => {
        expect(isFirstOfMonth('2026-06-01')).toBe(true)
    })
    it('rejects non-first days and bad formats', () => {
        expect(isFirstOfMonth('2026-06-15')).toBe(false)
        expect(isFirstOfMonth('2026-6-1')).toBe(false)
        expect(isFirstOfMonth('not-a-date')).toBe(false)
    })
})

describe('buildChangePoints', () => {
    it('drops months equal to the current open rate and equal consecutive months', () => {
        const entries: RateProgressionEntry[] = [
            { effective_from: '2026-07-01', hourly_rate: 200 }, // == current → drop
            { effective_from: '2026-08-01', hourly_rate: 250 }, // change → keep
            { effective_from: '2026-09-01', hourly_rate: 250 }, // == prev kept → drop
            { effective_from: '2026-10-01', hourly_rate: 300 }, // change → keep
        ]
        expect(buildChangePoints(200, entries)).toEqual([
            { effective_from: '2026-08-01', hourly_rate: 250 },
            { effective_from: '2026-10-01', hourly_rate: 300 },
        ])
    })

    it('keeps the first entry when there is no current rate', () => {
        const entries: RateProgressionEntry[] = [{ effective_from: '2026-07-01', hourly_rate: 200 }]
        expect(buildChangePoints(null, entries)).toEqual(entries)
    })

    it('sorts unsorted input before collapsing', () => {
        const entries: RateProgressionEntry[] = [
            { effective_from: '2026-10-01', hourly_rate: 300 },
            { effective_from: '2026-08-01', hourly_rate: 250 },
        ]
        expect(buildChangePoints(200, entries)).toEqual([
            { effective_from: '2026-08-01', hourly_rate: 250 },
            { effective_from: '2026-10-01', hourly_rate: 300 },
        ])
    })
})

describe('validateProgressionEntries', () => {
    const base = { nextMonthFirst: '2026-06-01', latestExistingEffectiveFrom: null }

    it('passes a valid ascending batch', () => {
        expect(() =>
            validateProgressionEntries(
                [
                    { effective_from: '2026-06-01', hourly_rate: 250 },
                    { effective_from: '2026-09-01', hourly_rate: 300 },
                ],
                base,
            ),
        ).not.toThrow()
    })

    it('rejects an empty batch', () => {
        expect(() => validateProgressionEntries([], base)).toThrow(/Brak miesięcy/)
    })

    it('rejects a non-first-of-month date', () => {
        expect(() =>
            validateProgressionEntries([{ effective_from: '2026-06-15', hourly_rate: 250 }], base),
        ).toThrow(/1\. dnia miesiąca/)
    })

    it('rejects a month before next month', () => {
        expect(() =>
            validateProgressionEntries([{ effective_from: '2026-05-01', hourly_rate: 250 }], base),
        ).toThrow(/najwcześniejszy dozwolony/)
    })

    it('rejects a month beyond the 24-month horizon', () => {
        expect(() =>
            validateProgressionEntries([{ effective_from: '2028-06-01', hourly_rate: 250 }], base),
        ).toThrow(/poza horyzontem/)
    })

    it('enforces append-only against the latest existing scheduled month', () => {
        expect(() =>
            validateProgressionEntries([{ effective_from: '2026-08-01', hourly_rate: 250 }], {
                nextMonthFirst: '2026-06-01',
                latestExistingEffectiveFrom: '2026-09-01',
            }),
        ).toThrow(/tylko dopisywanie/)
    })

    it('rejects a negative rate and an over-cap rate', () => {
        expect(() =>
            validateProgressionEntries([{ effective_from: '2026-06-01', hourly_rate: -1 }], base),
        ).toThrow(/>= 0/)
        expect(() =>
            validateProgressionEntries([{ effective_from: '2026-06-01', hourly_rate: RATE_MAX + 1 }], base),
        ).toThrow(/za duża/)
    })

    it('rejects non-ascending / duplicate months', () => {
        expect(() =>
            validateProgressionEntries(
                [
                    { effective_from: '2026-09-01', hourly_rate: 250 },
                    { effective_from: '2026-09-01', hourly_rate: 300 },
                ],
                base,
            ),
        ).toThrow(/rosnące i unikalne/)
    })
})

describe('buildCopyEntries', () => {
    const nextMonthFirst = '2026-06-01'

    it('copies all future change-points into an empty target', () => {
        const res = buildCopyEntries({
            sourceFutureChangePoints: [
                { effective_from: '2026-07-01', hourly_rate: 250 },
                { effective_from: '2026-09-01', hourly_rate: 300 },
            ],
            targetCurrentOpenRate: 200,
            targetLatestEffectiveFrom: null,
            nextMonthFirst,
        })
        expect(res.applied).toEqual([
            { effective_from: '2026-07-01', hourly_rate: 250 },
            { effective_from: '2026-09-01', hourly_rate: 300 },
        ])
        expect(res.skipped).toEqual([])
    })

    it('skips past months and months conflicting with the target schedule', () => {
        const res = buildCopyEntries({
            sourceFutureChangePoints: [
                { effective_from: '2026-04-01', hourly_rate: 240 }, // past
                { effective_from: '2026-07-01', hourly_rate: 250 }, // conflict (<= target latest)
                { effective_from: '2026-11-01', hourly_rate: 320 }, // applied
            ],
            targetCurrentOpenRate: 200,
            targetLatestEffectiveFrom: '2026-08-01',
            nextMonthFirst,
        })
        expect(res.applied).toEqual([{ effective_from: '2026-11-01', hourly_rate: 320 }])
        expect(res.skipped).toEqual([
            { effective_from: '2026-04-01', hourly_rate: 240, reason: 'past' },
            { effective_from: '2026-07-01', hourly_rate: 250, reason: 'conflict' },
        ])
    })

    it('marks a month equal to the target current rate as no_change', () => {
        const res = buildCopyEntries({
            sourceFutureChangePoints: [{ effective_from: '2026-07-01', hourly_rate: 200 }],
            targetCurrentOpenRate: 200,
            targetLatestEffectiveFrom: null,
            nextMonthFirst,
        })
        expect(res.applied).toEqual([])
        expect(res.skipped).toEqual([{ effective_from: '2026-07-01', hourly_rate: 200, reason: 'no_change' }])
    })
})
