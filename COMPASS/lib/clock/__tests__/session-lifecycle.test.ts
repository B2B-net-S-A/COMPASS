import { describe, expect, it } from 'vitest'
import type {
    ClockDailyAggregate,
    ClockSessionRow,
} from '../constants'
import {
    cleanClientTz,
    cleanDeviceLabel,
    decideLocation,
    getAuditActionForStop,
    isAttendanceBlocking,
    isSustainedIdleFromTail,
    mapToSessionListItem,
    summarizeClockMonth,
    validateStartClockInput,
} from '../session-lifecycle'

describe('cleanDeviceLabel', () => {
    it('trims surrounding whitespace', () => {
        expect(cleanDeviceLabel('  MacBook Pro  ')).toBe('MacBook Pro')
    })

    it('caps at 100 characters', () => {
        const long = 'a'.repeat(150)
        expect(cleanDeviceLabel(long)).toHaveLength(100)
    })

    it('handles empty after trim', () => {
        expect(cleanDeviceLabel('   ')).toBe('')
    })
})

describe('cleanClientTz', () => {
    it('trims and caps at 64', () => {
        expect(cleanClientTz('  Europe/Warsaw  ')).toBe('Europe/Warsaw')
        expect(cleanClientTz('x'.repeat(80))).toHaveLength(64)
    })
})

describe('validateStartClockInput', () => {
    it('passes when both fields are non-empty', () => {
        expect(() =>
            validateStartClockInput({ deviceLabel: 'Mac', clientTz: 'Europe/Warsaw' }),
        ).not.toThrow()
    })

    it('throws when deviceLabel is missing', () => {
        expect(() =>
            validateStartClockInput({ deviceLabel: '', clientTz: 'Europe/Warsaw' }),
        ).toThrow(/deviceLabel/)
    })

    it('throws when deviceLabel is whitespace only', () => {
        expect(() =>
            validateStartClockInput({ deviceLabel: '   ', clientTz: 'Europe/Warsaw' }),
        ).toThrow(/deviceLabel/)
    })

    it('throws when clientTz is missing', () => {
        expect(() =>
            validateStartClockInput({ deviceLabel: 'Mac', clientTz: '' }),
        ).toThrow(/clientTz/)
    })
})

describe('decideLocation', () => {
    it('prefers explicit input', () => {
        expect(decideLocation('remote', 'onsite')).toBe('remote')
    })

    it('falls back to profile default', () => {
        expect(decideLocation(undefined, 'remote')).toBe('remote')
    })

    it('falls back to onsite when both missing', () => {
        expect(decideLocation(undefined, null)).toBe('onsite')
        expect(decideLocation(undefined, undefined)).toBe('onsite')
    })
})

describe('isSustainedIdleFromTail', () => {
    it('returns false when fewer heartbeats than window', () => {
        const hb = Array.from({ length: 100 }, () => ({ was_active: false }))
        expect(isSustainedIdleFromTail(hb)).toBe(false)
    })

    it('returns false when any of the last 120 is active', () => {
        const hb = Array.from({ length: 200 }, (_, i) => ({
            was_active: i === 199, // last one is active
        }))
        expect(isSustainedIdleFromTail(hb)).toBe(false)
    })

    it('returns true when last 120 are all idle', () => {
        const hb = Array.from({ length: 200 }, (_, i) => ({
            was_active: i < 80, // first 80 active, last 120 idle
        }))
        expect(isSustainedIdleFromTail(hb)).toBe(true)
    })

    it('honors custom window size', () => {
        const hb = Array.from({ length: 10 }, () => ({ was_active: false }))
        expect(isSustainedIdleFromTail(hb, 5)).toBe(true)
        expect(isSustainedIdleFromTail(hb, 20)).toBe(false)
    })

    it('returns false on empty input', () => {
        expect(isSustainedIdleFromTail([])).toBe(false)
    })
})

describe('mapToSessionListItem', () => {
    const baseRow: ClockSessionRow = {
        id: 's1',
        user_id: 'u1',
        started_at: '2026-05-11T08:00:00Z',
        ended_at: '2026-05-11T16:30:00Z',
        last_heartbeat: '2026-05-11T16:30:00Z',
        active_seconds: 28800, // 8h
        idle_seconds: 1800,
        closed_reason: 'manual',
        device_label: 'Mac',
        client_tz: 'Europe/Warsaw',
        location: 'remote',
    }

    it('adds duration_minutes derived from active_seconds', () => {
        const out = mapToSessionListItem(baseRow)
        expect(out.duration_minutes).toBe(480) // 28800 / 60
        expect(out.id).toBe('s1')
        expect(out.active_seconds).toBe(28800)
    })

    it('rounds to the nearest minute', () => {
        const row = { ...baseRow, active_seconds: 31 } // 0.516 min
        expect(mapToSessionListItem(row).duration_minutes).toBe(1)
    })

    it('returns 0 for zero seconds', () => {
        const row = { ...baseRow, active_seconds: 0 }
        expect(mapToSessionListItem(row).duration_minutes).toBe(0)
    })
})

describe('summarizeClockMonth', () => {
    const days: ClockDailyAggregate[] = [
        {
            user_id: 'u1',
            work_date: '2026-05-01',
            active_seconds: 28800,
            hours: 8,
            first_clock_in: '2026-05-01T08:00:00Z',
            last_clock_out: '2026-05-01T16:00:00Z',
            session_count: 1,
        },
        {
            user_id: 'u1',
            work_date: '2026-05-02',
            active_seconds: 14400,
            hours: 4,
            first_clock_in: '2026-05-02T09:00:00Z',
            last_clock_out: '2026-05-02T13:00:00Z',
            session_count: 2,
        },
    ]

    it('sums hours and session count', () => {
        const out = summarizeClockMonth(2026, 5, days)
        expect(out).toEqual({
            year: 2026,
            month: 5,
            days,
            totalHours: 12,
            sessionCount: 3,
        })
    })

    it('returns zero totals for empty input', () => {
        const out = summarizeClockMonth(2026, 5, [])
        expect(out.totalHours).toBe(0)
        expect(out.sessionCount).toBe(0)
        expect(out.days).toEqual([])
    })

    it('coerces string-numeric hours (Postgres NUMERIC quirk)', () => {
        const dirtyDays = [
            { ...days[0], hours: '8.5' as unknown as number, session_count: '2' as unknown as number },
        ] as ClockDailyAggregate[]
        const out = summarizeClockMonth(2026, 5, dirtyDays)
        expect(out.totalHours).toBe(8.5)
        expect(out.sessionCount).toBe(2)
    })
})

describe('getAuditActionForStop', () => {
    it('maps manual to STOPPED', () => {
        expect(getAuditActionForStop('manual')).toBe('WORK_CLOCK_STOPPED')
    })

    it('maps every other reason to AUTO_STOPPED', () => {
        const reasons = [
            'idle_timeout',
            'daily_cutoff',
            'sleep_detected',
            'taken_over',
            'admin_close',
        ] as const
        for (const r of reasons) {
            expect(getAuditActionForStop(r)).toBe('WORK_CLOCK_AUTO_STOPPED')
        }
    })
})

describe('isAttendanceBlocking', () => {
    it('returns true for leave-blocking statuses', () => {
        expect(isAttendanceBlocking('vacation')).toBe(true)
        expect(isAttendanceBlocking('sick_leave')).toBe(true)
        expect(isAttendanceBlocking('parental_leave')).toBe(true)
        expect(isAttendanceBlocking('unpaid_leave')).toBe(true)
    })

    it('returns false for non-blocking statuses', () => {
        expect(isAttendanceBlocking('active')).toBe(false)
        expect(isAttendanceBlocking('')).toBe(false)
        expect(isAttendanceBlocking('unknown')).toBe(false)
    })
})
