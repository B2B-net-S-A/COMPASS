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
}

function toDate(ts: string | Date): Date {
    return ts instanceof Date ? ts : new Date(ts)
}

/**
 * Recalculate active/idle seconds from a heartbeat list.
 *
 * Each heartbeat counts as HEARTBEAT_INTERVAL_SECONDS of either active or idle
 * time. Duplicates by ts (rare — DB has UNIQUE(session_id, ts)) are deduped here
 * defensively. Heartbeats arriving out of order are sorted before counting so
 * that a future "gap detection" extension can subtract long gaps.
 */
export function aggregateHeartbeats(heartbeats: ReadonlyArray<HeartbeatRow>): AggregationResult {
    if (heartbeats.length === 0) {
        return { activeSeconds: 0, idleSeconds: 0, totalHeartbeats: 0, activeHeartbeats: 0 }
    }

    const seen = new Set<number>()
    let active = 0
    let idle = 0
    for (const hb of heartbeats) {
        const tsMs = toDate(hb.ts).getTime()
        if (seen.has(tsMs)) continue
        seen.add(tsMs)
        if (hb.was_active) active += 1
        else idle += 1
    }

    return {
        activeSeconds: active * HEARTBEAT_INTERVAL_SECONDS,
        idleSeconds: idle * HEARTBEAT_INTERVAL_SECONDS,
        totalHeartbeats: active + idle,
        activeHeartbeats: active,
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
