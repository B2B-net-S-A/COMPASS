import { describe, expect, it } from 'vitest'
import {
    bucketActivityRates,
    clampSuggestedHours,
    cleanRoutePath,
    cleanRouteTitle,
    formatClockSuggestedDescription,
    selectSuggestableEntries,
    type AttendanceRow,
    type DailyRow,
    type ExistingEntryRow,
    type HeartbeatTimestamp,
} from '../daily-summary'

describe('bucketActivityRates', () => {
    it('returns empty array for empty input', () => {
        expect(bucketActivityRates([])).toEqual([])
    })

    it('groups heartbeats into 10-min buckets and computes Hubstaff rate', () => {
        // 20 heartbeats in one 10-min window, 15 active → rate = 75%
        const hb: HeartbeatTimestamp[] = []
        for (let i = 0; i < 20; i++) {
            hb.push({
                ts: new Date(2026, 4, 11, 12, 0, i * 30).toISOString(),
                was_active: i < 15,
            })
        }
        const out = bucketActivityRates(hb)
        expect(out).toHaveLength(1)
        expect(out[0].rate).toBe(75)
        expect(out[0].sampleSize).toBe(20)
    })

    it('sorts buckets chronologically', () => {
        const hb: HeartbeatTimestamp[] = [
            { ts: '2026-05-11T13:00:00Z', was_active: true },
            { ts: '2026-05-11T12:00:00Z', was_active: true },
            { ts: '2026-05-11T14:00:00Z', was_active: true },
        ]
        const out = bucketActivityRates(hb)
        expect(out).toHaveLength(3)
        expect(out[0].bucketStart < out[1].bucketStart).toBe(true)
        expect(out[1].bucketStart < out[2].bucketStart).toBe(true)
    })

    it('splits across 10-min boundaries', () => {
        const hb: HeartbeatTimestamp[] = [
            { ts: '2026-05-11T12:05:00Z', was_active: true },
            { ts: '2026-05-11T12:09:59Z', was_active: true },
            { ts: '2026-05-11T12:10:00Z', was_active: true },
            { ts: '2026-05-11T12:15:00Z', was_active: true },
        ]
        const out = bucketActivityRates(hb)
        expect(out).toHaveLength(2)
        expect(out[0].bucketStart).toBe('2026-05-11T12:00:00.000Z')
        expect(out[0].sampleSize).toBe(2)
        expect(out[1].bucketStart).toBe('2026-05-11T12:10:00.000Z')
        expect(out[1].sampleSize).toBe(2)
    })

    it('rounds rate to nearest integer', () => {
        // 7 active / 20 = 35%, exact
        const hb: HeartbeatTimestamp[] = []
        for (let i = 0; i < 20; i++) {
            hb.push({
                ts: new Date(2026, 4, 11, 12, 0, i * 30).toISOString(),
                was_active: i < 7,
            })
        }
        expect(bucketActivityRates(hb)[0].rate).toBe(35)
    })

    it('supports custom bucket size and denominator', () => {
        // 5-min buckets, max 10 per bucket
        const hb: HeartbeatTimestamp[] = []
        for (let i = 0; i < 10; i++) {
            hb.push({
                ts: new Date(2026, 4, 11, 12, 0, i * 30).toISOString(),
                was_active: i < 8,
            })
        }
        const out = bucketActivityRates(hb, 5, 10)
        expect(out).toHaveLength(1)
        expect(out[0].rate).toBe(80)
    })
})

describe('cleanRoutePath', () => {
    it('returns relative path unchanged when no query/hash', () => {
        expect(cleanRoutePath('/internal/akademia')).toBe('/internal/akademia')
    })

    it('strips query strings (privacy)', () => {
        expect(cleanRoutePath('/internal/akademia?utm=foo&id=42')).toBe('/internal/akademia')
    })

    it('strips hash fragments', () => {
        expect(cleanRoutePath('/internal/akademia#section')).toBe('/internal/akademia')
    })

    it('strips both query and hash', () => {
        expect(cleanRoutePath('/internal/akademia?id=1#tab')).toBe('/internal/akademia')
    })

    it('caps to 200 chars', () => {
        const long = '/internal/' + 'x'.repeat(300)
        expect(cleanRoutePath(long)).toHaveLength(200)
    })

    it('throws on non-relative path', () => {
        expect(() => cleanRoutePath('https://example.com/spy')).toThrow(/relatywny/)
    })

    it('throws on non-string input', () => {
        expect(() => cleanRoutePath(null)).toThrow(/relatywny/)
        expect(() => cleanRoutePath(undefined)).toThrow(/relatywny/)
        expect(() => cleanRoutePath(42)).toThrow(/relatywny/)
    })

    it('throws on empty string', () => {
        expect(() => cleanRoutePath('')).toThrow(/relatywny/)
    })
})

describe('cleanRouteTitle', () => {
    it('returns null when title is missing', () => {
        expect(cleanRouteTitle(null)).toBeNull()
        expect(cleanRouteTitle(undefined)).toBeNull()
    })

    it('caps title at 200 chars', () => {
        expect(cleanRouteTitle('x'.repeat(300))).toHaveLength(200)
    })

    it('returns short title unchanged', () => {
        expect(cleanRouteTitle('Akademia')).toBe('Akademia')
    })

    it('preserves empty string as empty (not null)', () => {
        // Empty string is technically present — let it through so callers see explicit blanking
        expect(cleanRouteTitle('')).toBe('')
    })
})

describe('clampSuggestedHours', () => {
    it('clamps to (0.01, 24)', () => {
        expect(clampSuggestedHours(0)).toBe(0.01)
        expect(clampSuggestedHours(-5)).toBe(0.01)
        expect(clampSuggestedHours(25)).toBe(24)
        expect(clampSuggestedHours(8.5)).toBe(8.5)
    })
})

describe('formatClockSuggestedDescription', () => {
    it('uses Polish singular for 1', () => {
        expect(formatClockSuggestedDescription(1)).toBe('Auto z work clock — 1 sesja')
    })

    it('uses Polish plural for non-1', () => {
        expect(formatClockSuggestedDescription(0)).toBe('Auto z work clock — 0 sesje')
        expect(formatClockSuggestedDescription(2)).toBe('Auto z work clock — 2 sesje')
        expect(formatClockSuggestedDescription(5)).toBe('Auto z work clock — 5 sesje')
    })
})

describe('selectSuggestableEntries', () => {
    const baseDays: DailyRow[] = [
        { work_date: '2026-05-04', hours: 8, session_count: 1 },
        { work_date: '2026-05-05', hours: 7.5, session_count: 2 },
        { work_date: '2026-05-06', hours: 6, session_count: 1 },
    ]

    it('emits one entry per day when nothing is blocked or existing', () => {
        const out = selectSuggestableEntries({
            days: baseDays,
            attendance: [],
            existingEntries: [],
        })
        expect(out.entries).toHaveLength(3)
        expect(out.skippedExisting).toBe(0)
        expect(out.totalDaysWithTracking).toBe(3)
    })

    it('skips days with blocking attendance', () => {
        const attendance: AttendanceRow[] = [
            { date: '2026-05-04', status: 'vacation' },
            { date: '2026-05-06', status: 'sick_leave' },
        ]
        const out = selectSuggestableEntries({
            days: baseDays,
            attendance,
            existingEntries: [],
        })
        expect(out.entries).toHaveLength(1)
        expect(out.entries[0].work_date).toBe('2026-05-05')
        expect(out.skippedExisting).toBe(0)
    })

    it('does NOT skip days with non-blocking attendance (e.g. active)', () => {
        const attendance: AttendanceRow[] = [{ date: '2026-05-04', status: 'active' }]
        const out = selectSuggestableEntries({
            days: baseDays,
            attendance,
            existingEntries: [],
        })
        expect(out.entries).toHaveLength(3)
    })

    it('skips days that already have a timesheet entry', () => {
        const existingEntries: ExistingEntryRow[] = [
            { work_date: '2026-05-05', source: 'manual' },
            { work_date: '2026-05-06', source: 'clock_suggested' },
        ]
        const out = selectSuggestableEntries({
            days: baseDays,
            attendance: [],
            existingEntries,
        })
        expect(out.entries).toHaveLength(1)
        expect(out.entries[0].work_date).toBe('2026-05-04')
        expect(out.skippedExisting).toBe(2)
    })

    it('clamps hours within (0.01, 24)', () => {
        const days: DailyRow[] = [
            { work_date: '2026-05-04', hours: 0, session_count: 1 },
            { work_date: '2026-05-05', hours: 30, session_count: 1 },
        ]
        const out = selectSuggestableEntries({ days, attendance: [], existingEntries: [] })
        expect(out.entries[0].hours).toBe(0.01)
        expect(out.entries[1].hours).toBe(24)
    })

    it('coerces string-numeric Postgres NUMERIC hours', () => {
        const days = [
            { work_date: '2026-05-04', hours: '8.5' as unknown as number, session_count: 2 },
        ] as DailyRow[]
        const out = selectSuggestableEntries({ days, attendance: [], existingEntries: [] })
        expect(out.entries[0].hours).toBe(8.5)
    })

    it('records totalDaysWithTracking before any filtering', () => {
        const out = selectSuggestableEntries({
            days: baseDays,
            attendance: [
                { date: '2026-05-04', status: 'vacation' },
                { date: '2026-05-05', status: 'vacation' },
                { date: '2026-05-06', status: 'vacation' },
            ],
            existingEntries: [],
        })
        expect(out.entries).toHaveLength(0)
        expect(out.totalDaysWithTracking).toBe(3)
    })

    it('attaches Polish plural description and session_count', () => {
        const out = selectSuggestableEntries({
            days: baseDays,
            attendance: [],
            existingEntries: [],
        })
        expect(out.entries[0].description).toBe('Auto z work clock — 1 sesja')
        expect(out.entries[1].description).toBe('Auto z work clock — 2 sesje')
        expect(out.entries[0].session_count).toBe(1)
    })
})
