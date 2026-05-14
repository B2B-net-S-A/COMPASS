// Phase 17 — Pure aggregation logic for work_clock_sessions.active_seconds.
// Source of truth = work_clock_heartbeats with was_active=true.
// Each heartbeat represents HEARTBEAT_INTERVAL_SECONDS of activity ending at ts.

export const HEARTBEAT_INTERVAL_SECONDS = 30
export const SUSTAINED_IDLE_HEARTBEATS = 120 // 60 minutes of all-idle heartbeats triggers auto-stop
export const DISCREPANCY_THRESHOLD_HOURS = 1.0 // |declared - tracked| > 1.0h flags correction
export const KP_DAILY_HOURS_LIMIT = 13 // KP art. 129 — max with overtime

export interface HeartbeatRow {
    ts: string | Date
    was_active: boolean
}

export interface AggregationResult {
    activeSeconds: number
    idleSeconds: number
    totalHeartbeats: number
    activeHeartbeats: number
    /** R3: heartbeats that fell within a paused range and were not counted */
    skippedDuringPause: number
}

/**
 * R3: a closed pause range. Heartbeats with ts in [from, to) are NOT counted
 * toward active_seconds (user explicitly paused tracking).
 */
export interface PausedRange {
    from: string | Date
    to: string | Date
}

function toDate(ts: string | Date): Date {
    return ts instanceof Date ? ts : new Date(ts)
}

function isInPausedRange(tsMs: number, ranges: ReadonlyArray<PausedRange>): boolean {
    for (const r of ranges) {
        const fromMs = toDate(r.from).getTime()
        const toMs = toDate(r.to).getTime()
        if (tsMs >= fromMs && tsMs < toMs) return true
    }
    return false
}

/**
 * Recalculate active/idle seconds from a heartbeat list.
 *
 * Each heartbeat counts as HEARTBEAT_INTERVAL_SECONDS of either active or idle
 * time. Duplicates by ts (rare — DB has UNIQUE(session_id, ts)) are deduped here
 * defensively.
 *
 * R3: pausedRanges (optional) — heartbeats with ts inside any range are skipped
 * (counted in `skippedDuringPause` only). Used when user explicitly paused via
 * "Pauza 30/60/120 min" button.
 */
export function aggregateHeartbeats(
    heartbeats: ReadonlyArray<HeartbeatRow>,
    pausedRanges: ReadonlyArray<PausedRange> = [],
): AggregationResult {
    if (heartbeats.length === 0) {
        return {
            activeSeconds: 0,
            idleSeconds: 0,
            totalHeartbeats: 0,
            activeHeartbeats: 0,
            skippedDuringPause: 0,
        }
    }

    const seen = new Set<number>()
    let active = 0
    let idle = 0
    let skipped = 0
    for (const hb of heartbeats) {
        const tsMs = toDate(hb.ts).getTime()
        if (seen.has(tsMs)) continue
        seen.add(tsMs)
        if (pausedRanges.length > 0 && isInPausedRange(tsMs, pausedRanges)) {
            skipped += 1
            continue
        }
        if (hb.was_active) active += 1
        else idle += 1
    }

    return {
        activeSeconds: active * HEARTBEAT_INTERVAL_SECONDS,
        idleSeconds: idle * HEARTBEAT_INTERVAL_SECONDS,
        totalHeartbeats: active + idle,
        activeHeartbeats: active,
        skippedDuringPause: skipped,
    }
}

/**
 * Detect sustained idle: all-idle for the last N heartbeats (default 120 = 60 min).
 * Used by /api/clock/heartbeat and /api/cron/clock-idle-reaper to auto-close stale sessions.
 */
export function isSustainedIdle(
    heartbeats: ReadonlyArray<HeartbeatRow>,
    windowSize: number = SUSTAINED_IDLE_HEARTBEATS,
): boolean {
    if (heartbeats.length < windowSize) return false
    const sorted = [...heartbeats].sort((a, b) => toDate(a.ts).getTime() - toDate(b.ts).getTime())
    const tail = sorted.slice(-windowSize)
    return tail.every((hb) => !hb.was_active)
}

/**
 * R11 (PR-C1): find the peak 60-min activity window from a heartbeat list.
 * Used by clock-daily-summary cron to tell user "your peak hour was 10-11am".
 * Returns null when not enough data to compute (less than 60 min of heartbeats).
 */
export interface PeakWindow {
    start: Date
    end: Date
    activeHeartbeats: number
    /** 0..1 — fraction of heartbeats in the window that were was_active=true */
    score: number
}

export function findPeakActivityWindow(
    heartbeats: ReadonlyArray<HeartbeatRow>,
    windowMinutes = 60,
): PeakWindow | null {
    if (heartbeats.length === 0) return null
    const sorted = [...heartbeats].sort(
        (a, b) => toDate(a.ts).getTime() - toDate(b.ts).getTime(),
    )
    const windowMs = windowMinutes * 60 * 1000

    let bestStart = 0
    let bestEnd = 0
    let bestActive = 0
    let bestTotal = 0

    let leftIdx = 0
    let activeInWindow = 0
    let totalInWindow = 0

    for (let rightIdx = 0; rightIdx < sorted.length; rightIdx++) {
        const right = sorted[rightIdx]
        const rightMs = toDate(right.ts).getTime()
        if (right.was_active) activeInWindow++
        totalInWindow++

        // shrink left until window <= windowMs
        while (rightMs - toDate(sorted[leftIdx].ts).getTime() > windowMs) {
            if (sorted[leftIdx].was_active) activeInWindow--
            totalInWindow--
            leftIdx++
        }

        // candidate window
        if (activeInWindow > bestActive) {
            bestActive = activeInWindow
            bestTotal = totalInWindow
            bestStart = toDate(sorted[leftIdx].ts).getTime()
            bestEnd = rightMs
        }
    }

    if (bestActive === 0) return null
    return {
        start: new Date(bestStart),
        end: new Date(bestEnd),
        activeHeartbeats: bestActive,
        score: bestTotal === 0 ? 0 : bestActive / bestTotal,
    }
}

/**
 * Decide whether a timesheet entry needs admin correction approval.
 * - Declared > 13h (KP art. 129) → always flag
 * - |declared - tracked| > threshold → flag
 *
 * `tracked` may be null when entry was typed manually (no clock data).
 * In that case only the KP cap applies.
 */
export function isCorrectionRequired(
    declaredHours: number,
    trackedHours: number | null,
    thresholdHours: number = DISCREPANCY_THRESHOLD_HOURS,
): boolean {
    if (declaredHours > KP_DAILY_HOURS_LIMIT) return true
    if (trackedHours == null) return false
    return Math.abs(declaredHours - trackedHours) > thresholdHours
}
