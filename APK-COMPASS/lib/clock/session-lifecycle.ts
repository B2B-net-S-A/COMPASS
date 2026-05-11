// Phase 17 — Pure session lifecycle helpers.
// Decision logic, input validation, and shape transforms used by the
// start/stop/auto-stop server actions. No Supabase access — server actions in
// lib/actions/internal-clock.ts call these and supply DB-fetched data.

import {
    HOURS_BLOCKING_ATTENDANCE,
    type ClockClosedReason,
    type ClockDailyAggregate,
    type ClockLocation,
    type ClockMonthData,
    type ClockSessionListItem,
    type ClockSessionRow,
    type StartClockInput,
} from './constants'

const DEVICE_LABEL_MAX = 100
const CLIENT_TZ_MAX = 64
const SUSTAINED_IDLE_WINDOW = 120 // 60 minutes of all-idle heartbeats at 30s interval

export interface HeartbeatLike {
    was_active: boolean
}

/**
 * Trim and cap device label to the column width (varchar(100)).
 */
export function cleanDeviceLabel(label: string): string {
    return label.trim().slice(0, DEVICE_LABEL_MAX)
}

/**
 * Trim and cap client timezone string to the column width (varchar(64)).
 */
export function cleanClientTz(tz: string): string {
    return tz.trim().slice(0, CLIENT_TZ_MAX)
}

/**
 * Throw a user-friendly error when required start-clock fields are missing.
 * Mirrors the inline checks previously in startClockSession.
 */
export function validateStartClockInput(input: StartClockInput): void {
    if (!input.deviceLabel?.trim()) throw new Error('deviceLabel jest wymagany.')
    if (!input.clientTz?.trim()) throw new Error('clientTz jest wymagany.')
}

/**
 * Pick a session location: explicit input > profile default > 'onsite' fallback.
 */
export function decideLocation(
    explicit: ClockLocation | undefined,
    profileDefault: ClockLocation | null | undefined,
): ClockLocation {
    return explicit ?? profileDefault ?? 'onsite'
}

/**
 * Local sustained-idle check that ASSUMES the input is already sorted by ts asc.
 *
 * Differs from aggregation.isSustainedIdle: this variant skips the sort step
 * because heartbeats arrive from DB with .order('ts'), and re-sorting 1000+
 * rows on every heartbeat poll would be wasteful.
 *
 * Returns true when the last `windowSize` heartbeats are all was_active=false.
 */
export function isSustainedIdleFromTail(
    heartbeats: ReadonlyArray<HeartbeatLike>,
    windowSize: number = SUSTAINED_IDLE_WINDOW,
): boolean {
    return (
        heartbeats.length >= windowSize &&
        heartbeats.slice(-windowSize).every((h) => !h.was_active)
    )
}

/**
 * Map a raw clock session row to the public list-item DTO (adds duration_minutes).
 */
export function mapToSessionListItem(row: ClockSessionRow): ClockSessionListItem {
    return {
        ...row,
        duration_minutes: Math.round(row.active_seconds / 60),
    }
}

/**
 * Aggregate daily rows into the month DTO returned by getMyClockMonth.
 */
export function summarizeClockMonth(
    year: number,
    month: number,
    days: ClockDailyAggregate[],
): ClockMonthData {
    return {
        year,
        month,
        days,
        totalHours: days.reduce((sum, d) => sum + Number(d.hours), 0),
        sessionCount: days.reduce((sum, d) => sum + Number(d.session_count), 0),
    }
}

/**
 * Pick the audit action name based on how the session ended.
 * Manual = WORK_CLOCK_STOPPED, everything else = WORK_CLOCK_AUTO_STOPPED.
 */
export function getAuditActionForStop(reason: ClockClosedReason): string {
    return reason === 'manual' ? 'WORK_CLOCK_STOPPED' : 'WORK_CLOCK_AUTO_STOPPED'
}

/**
 * Return true when an attendance status blocks the user from clocking in
 * (vacation, sick_leave, parental_leave, unpaid_leave). Used both at start-time
 * (block new sessions) and at suggest-time (skip days from suggestions).
 */
export function isAttendanceBlocking(status: string): boolean {
    return HOURS_BLOCKING_ATTENDANCE.includes(status)
}
