// Phase 17 — Pure date / timezone helpers for the work-clock feature.
// Centralises the YYYY-MM-DD ↔ ISO-with-time conversions used across server
// actions (month boundaries, day boundaries, 5-min buckets). No DB access,
// no headers() — safe to call from any context.

import { endOfMonth, format, startOfMonth } from 'date-fns'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const FIVE_MIN_MS = 5 * 60 * 1000

export interface DateRange {
    start: string
    end: string
}

export interface IsoRange {
    startIso: string
    endIso: string
}

export function isValidIsoDate(date: string): boolean {
    return typeof date === 'string' && ISO_DATE_RE.test(date)
}

export function assertIsoDate(date: string): void {
    if (!isValidIsoDate(date)) {
        throw new Error('date musi być w formacie YYYY-MM-DD')
    }
}

export function todayIsoDate(now: Date = new Date()): string {
    return format(now, 'yyyy-MM-dd')
}

/**
 * Returns `start`/`end` as YYYY-MM-DD for the calendar month.
 * `month` is 1-12 (Polish calendar style), not 0-11.
 */
export function getMonthDateRange(year: number, month: number): DateRange {
    const ref = new Date(year, month - 1, 1)
    return {
        start: format(startOfMonth(ref), 'yyyy-MM-dd'),
        end: format(endOfMonth(ref), 'yyyy-MM-dd'),
    }
}

/**
 * Returns ISO timestamps spanning the full calendar month (inclusive of last
 * second of last day). Used for `started_at` BETWEEN queries.
 */
export function getMonthIsoRange(year: number, month: number): IsoRange {
    const { start, end } = getMonthDateRange(year, month)
    return {
        startIso: `${start}T00:00:00Z`,
        endIso: `${end}T23:59:59Z`,
    }
}

/**
 * Returns ISO timestamps spanning a single calendar day in UTC. Input must be
 * YYYY-MM-DD; throws otherwise.
 */
export function getDayIsoRange(date: string): IsoRange {
    assertIsoDate(date)
    return {
        startIso: `${date}T00:00:00.000Z`,
        endIso: `${date}T23:59:59.999Z`,
    }
}

/**
 * R12: floor `nowMs` to the nearest 5-minute boundary and return as ISO.
 * Used for deduplicating route_metadata observations (UNIQUE per bucket).
 */
export function current5MinBucketIso(nowMs: number = Date.now()): string {
    const bucketMs = Math.floor(nowMs / FIVE_MIN_MS) * FIVE_MIN_MS
    return new Date(bucketMs).toISOString()
}
