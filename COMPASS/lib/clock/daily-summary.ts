// Phase 17 / 17b — Pure daily-summary helpers.
// Bucketed activity rate (R4), route-metadata input cleaning (R12), and the
// suggest-timesheet-entries decision logic. Server actions in
// lib/actions/internal-clock.ts feed pre-fetched DB rows into these helpers.

import { isAttendanceBlocking } from './session-lifecycle'

// ─── Activity rate (R4) ─────────────────────────────────────────────────────

const TEN_MIN_MS = 10 * 60 * 1000
const HEARTBEAT_BUCKET_MIN = 10
/** 30s interval × 20 = 10 min (Hubstaff-style normalisation denominator) */
const MAX_HEARTBEATS_PER_BUCKET = 20

export interface ActivityRateBucket {
    bucketStart: string
    /** Percentage 0-100 of heartbeats in the bucket that were was_active=true. */
    rate: number
    /** Total heartbeats observed in the bucket (low values => statistically noisy). */
    sampleSize: number
}

export interface HeartbeatTimestamp {
    ts: string
    was_active: boolean
}

/**
 * R4: bucket heartbeats into N-minute windows and compute activity rate
 * (Hubstaff formula: active_count / max_per_window × 100).
 *
 * Pure function — no DB access. Used by getMyActivityRateForDay server action.
 *
 * @param heartbeats - heartbeats for a user-day (order does not matter)
 * @param bucketMinutes - bucket width (default 10 min)
 * @param maxPerBucket - denominator for rate calc (default 20 = 30s × 20)
 */
export function bucketActivityRates(
    heartbeats: ReadonlyArray<HeartbeatTimestamp>,
    bucketMinutes: number = HEARTBEAT_BUCKET_MIN,
    maxPerBucket: number = MAX_HEARTBEATS_PER_BUCKET,
): ActivityRateBucket[] {
    if (heartbeats.length === 0) return []

    const bucketMs = bucketMinutes === HEARTBEAT_BUCKET_MIN
        ? TEN_MIN_MS
        : bucketMinutes * 60 * 1000

    const buckets = new Map<number, { active: number; total: number }>()
    for (const h of heartbeats) {
        const ts = new Date(h.ts).getTime()
        const bucketKey = Math.floor(ts / bucketMs) * bucketMs
        const existing = buckets.get(bucketKey) ?? { active: 0, total: 0 }
        existing.total += 1
        if (h.was_active) existing.active += 1
        buckets.set(bucketKey, existing)
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([key, v]) => ({
            bucketStart: new Date(key).toISOString(),
            rate: Math.round((v.active / maxPerBucket) * 100),
            sampleSize: v.total,
        }))
}

// ─── Route metadata (R12) ───────────────────────────────────────────────────

const ROUTE_PATH_MAX = 200
const ROUTE_TITLE_MAX = 200

/**
 * R12: validate + clean a route_path for storage in work_clock_route_metadata.
 *
 * Privacy: query strings + hashes are stripped to avoid PII leaking through
 * URL params. Path must be relative (`/internal/...` or `/home/...`).
 *
 * Throws when input is not a string or doesn't start with '/'.
 */
export function cleanRoutePath(routePath: unknown): string {
    if (typeof routePath !== 'string' || !routePath.startsWith('/')) {
        throw new Error('route_path musi być relatywny do Compass.')
    }
    return routePath.split('?')[0].split('#')[0].slice(0, ROUTE_PATH_MAX)
}

/** Cap optional page title to column width; null when missing. */
export function cleanRouteTitle(title: string | null | undefined): string | null {
    if (title == null) return null
    return title.slice(0, ROUTE_TITLE_MAX)
}

// ─── Suggested timesheet entries ─────────────────────────────────────────────

const SUGGESTED_HOUR_MIN = 0.01
const SUGGESTED_HOUR_MAX = 24

/** Clamp clock-daily hours to (0.01, 24) — DB column is NUMERIC(4,2). */
export function clampSuggestedHours(hours: number): number {
    return Math.max(SUGGESTED_HOUR_MIN, Math.min(SUGGESTED_HOUR_MAX, hours))
}

/** Format the Polish-language description for a clock-suggested entry. */
export function formatClockSuggestedDescription(sessionCount: number): string {
    const word = sessionCount === 1 ? 'sesja' : 'sesje'
    return `Auto z work clock — ${sessionCount} ${word}`
}

export interface DailyRow {
    work_date: string
    hours: number
    session_count: number
}

export interface AttendanceRow {
    date: string
    status: string
}

export interface ExistingEntryRow {
    work_date: string
    source: string
}

export interface SuggestableEntry {
    work_date: string
    hours: number
    description: string
    session_count: number
}

export interface SelectSuggestableInput {
    days: ReadonlyArray<DailyRow>
    attendance: ReadonlyArray<AttendanceRow>
    existingEntries: ReadonlyArray<ExistingEntryRow>
}

export interface SelectSuggestableOutput {
    entries: SuggestableEntry[]
    skippedExisting: number
    totalDaysWithTracking: number
}

/**
 * Pure decision: given daily clock aggregates, attendance, and existing
 * timesheet entries, return the rows that should be inserted as
 * `clock_suggested` entries.
 *
 * Skips:
 *  - Days where attendance has a blocking status (vacation/sick/parental/unpaid)
 *  - Days where any timesheet entry already exists (regardless of source)
 *
 * Hours are clamped to (0.01, 24); descriptions get Polish pluralisation.
 */
export function selectSuggestableEntries(
    input: SelectSuggestableInput,
): SelectSuggestableOutput {
    const blocked = new Set(
        input.attendance.filter((a) => isAttendanceBlocking(a.status)).map((a) => a.date),
    )
    const existingDates = new Set(input.existingEntries.map((e) => e.work_date))

    const entries: SuggestableEntry[] = []
    let skippedExisting = 0

    for (const d of input.days) {
        if (blocked.has(d.work_date)) continue
        if (existingDates.has(d.work_date)) {
            skippedExisting++
            continue
        }
        const hours = clampSuggestedHours(Number(d.hours))
        entries.push({
            work_date: d.work_date,
            hours,
            description: formatClockSuggestedDescription(d.session_count),
            session_count: d.session_count,
        })
    }

    return {
        entries,
        skippedExisting,
        totalDaysWithTracking: input.days.length,
    }
}
