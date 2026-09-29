import { describe, it, expect } from 'vitest'
import {
    firstDayOfNextMonth,
    addMonths,
    isFirstOfMonth,
    buildChangePoints,
    validateProgressionEntries,
    buildCopyEntries,
    validateScheduleReplacement,
    rateInEffectBefore,
    isSameSchedule,
    RATE_MAX,
} from '../progression'
import { ExpectedError } from '@/lib/actions/expected-error'
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

describe('validateScheduleReplacement', () => {
    // „Dziś" = wrzesień 2026: next month 2026-10-01, 12 miesięcy wstecz od bieżącego = 2025-09-01.
    const base = { nextMonthFirst: '2026-10-01', earliestAllowed: '2025-09-01' }

    it('accepts the current month and a past month (correction backwards)', () => {
        expect(() =>
            validateScheduleReplacement([{ effective_from: '2026-09-01', hourly_rate: 59.52 }], {
                ...base,
                replaceFrom: '2026-09-01',
            }),
        ).not.toThrow()
        expect(() =>
            validateScheduleReplacement([{ effective_from: '2026-03-01', hourly_rate: 50 }], {
                ...base,
                replaceFrom: '2026-03-01',
            }),
        ).not.toThrow()
    })

    it('accepts months inside an already scheduled ramp (no append-only lock)', () => {
        expect(() =>
            validateScheduleReplacement(
                [
                    { effective_from: '2026-12-01', hourly_rate: 61 },
                    { effective_from: '2027-06-01', hourly_rate: 65 },
                ],
                { ...base, replaceFrom: '2026-10-01' },
            ),
        ).not.toThrow()
    })

    it('accepts an empty batch (clear scheduled changes from the month on)', () => {
        expect(() => validateScheduleReplacement([], { ...base, replaceFrom: '2026-10-01' })).not.toThrow()
    })

    it('rejects a start older than the backdate window', () => {
        expect(() =>
            validateScheduleReplacement([{ effective_from: '2025-08-01', hourly_rate: 50 }], {
                ...base,
                replaceFrom: '2025-08-01',
            }),
        ).toThrow(/najwcześniej 2025-09-01/)
    })

    it('rejects an entry before the replacement start', () => {
        expect(() =>
            validateScheduleReplacement([{ effective_from: '2026-09-01', hourly_rate: 50 }], {
                ...base,
                replaceFrom: '2026-10-01',
            }),
        ).toThrow(/wcześniejszy niż 2026-10-01/)
    })

    it('rejects a mid-month start, a bad rate, beyond-horizon and non-ascending months', () => {
        expect(() => validateScheduleReplacement([], { ...base, replaceFrom: '2026-10-15' })).toThrow(
            /1\. dnia miesiąca/,
        )
        expect(() =>
            validateScheduleReplacement([{ effective_from: '2026-10-01', hourly_rate: -1 }], {
                ...base,
                replaceFrom: '2026-10-01',
            }),
        ).toThrow(/>= 0/)
        expect(() =>
            validateScheduleReplacement([{ effective_from: '2028-10-01', hourly_rate: 1 }], {
                ...base,
                replaceFrom: '2026-10-01',
            }),
        ).toThrow(/poza horyzontem/)
        expect(() =>
            validateScheduleReplacement(
                [
                    { effective_from: '2027-01-01', hourly_rate: 1 },
                    { effective_from: '2027-01-01', hourly_rate: 2 },
                ],
                { ...base, replaceFrom: '2026-10-01' },
            ),
        ).toThrow(/rosnące i unikalne/)
    })

    it('throws ExpectedError so the message reaches the user instead of the prod mask', () => {
        try {
            validateScheduleReplacement([], { ...base, replaceFrom: '2020-01-01' })
            expect.unreachable()
        } catch (e) {
            expect(e).toBeInstanceOf(ExpectedError)
        }
    })
})

describe('rateInEffectBefore', () => {
    const ramp = [
        { effective_from: '2026-05-01', hourly_rate: 42, currency: 'PLN' as const },
        { effective_from: '2026-07-01', hourly_rate: 45, currency: 'PLN' as const },
        { effective_from: '2027-01-01', hourly_rate: 50, currency: 'PLN' as const },
    ]

    it('returns the row running in the month before the cut, not the ramp tail', () => {
        expect(rateInEffectBefore(ramp, '2026-10-01')?.hourly_rate).toBe(45)
        expect(rateInEffectBefore(ramp, '2026-07-01')?.hourly_rate).toBe(42)
    })

    it('returns null when nothing ran before the cut', () => {
        expect(rateInEffectBefore(ramp, '2026-05-01')).toBeNull()
        expect(rateInEffectBefore([], '2026-10-01')).toBeNull()
    })
})

describe('isSameSchedule', () => {
    it('detects an identical replacement as a no-op', () => {
        const a = [{ effective_from: '2027-01-01', hourly_rate: 50 }]
        expect(isSameSchedule(a, [{ effective_from: '2027-01-01', hourly_rate: 50 }])).toBe(true)
    })
    it('treats removal of scheduled steps as a change', () => {
        expect(isSameSchedule([{ effective_from: '2027-01-01', hourly_rate: 50 }], [])).toBe(false)
        expect(isSameSchedule([], [])).toBe(true)
    })
})
