// Phase 17 — Pure idle-detector state machine for the client-side clock hook.
// Decoupled from React/DOM so it's unit-testable without happy-dom.

export const DEFAULT_IDLE_THRESHOLD_MS = 20 * 60 * 1000 // 20 min
export const IDLE_WARNING_MS = 50 * 60 * 1000           // R1: warning at 50 min before 60 min auto-close
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000  // 30s
export const SLEEP_DETECTION_FACTOR = 5                  // gap > 5× heartbeat = sleep

// R3 (pause): preset pause durations in minutes
export const PAUSE_PRESETS_MINUTES = [30, 60, 120] as const
export type PausePresetMinutes = (typeof PAUSE_PRESETS_MINUTES)[number]
export type PauseReason = 'break_30' | 'break_60' | 'break_120' | 'manual'

// R7 (mic/cam): when media is active, extend idle threshold to 3× default (60 min)
export const MEDIA_ACTIVE_IDLE_MULTIPLIER = 3
export function effectiveIdleThreshold(baseMs: number, mediaActive: boolean): number {
    return mediaActive ? baseMs * MEDIA_ACTIVE_IDLE_MULTIPLIER : baseMs
}

export function pauseReasonForDuration(minutes: number): PauseReason {
    if (minutes === 30) return 'break_30'
    if (minutes === 60) return 'break_60'
    if (minutes === 120) return 'break_120'
    return 'manual'
}

// R3: 'paused_break' added — explicit user pause (vs paused_hidden = page hidden)
export type ClockState = 'stopped' | 'active' | 'idle' | 'paused_hidden' | 'paused_break'

export interface ClockSnapshot {
    state: ClockState
    lastActivityMs: number
    lastTickMs: number
    pageVisible: boolean
    /** R3: ISO timestamp when explicit pause auto-resumes. null when not paused. */
    pausedUntilMs: number | null
}

export interface DetectorConfig {
    idleThresholdMs?: number
    heartbeatIntervalMs?: number
}

export interface DetectorInput {
    nowMs: number
    snapshot: ClockSnapshot
    config?: DetectorConfig
}

/**
 * Determine the current state given an existing snapshot and the current time.
 *
 * Rules (priority order):
 *  - If state is 'stopped' → stays stopped (only start() transitions out)
 *  - R3: If pausedUntilMs in future → 'paused_break' (explicit user pause)
 *  - If !pageVisible → 'paused_hidden' (don't count time, don't send wasActive=true)
 *  - If pageVisible && (now - lastActivity) <= threshold → 'active'
 *  - If pageVisible && (now - lastActivity) > threshold → 'idle'
 */
export function nextState({ nowMs, snapshot, config = {} }: DetectorInput): ClockState {
    const threshold = config.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS
    if (snapshot.state === 'stopped') return 'stopped'
    if (snapshot.pausedUntilMs != null && snapshot.pausedUntilMs > nowMs) return 'paused_break'
    if (!snapshot.pageVisible) return 'paused_hidden'
    return nowMs - snapshot.lastActivityMs <= threshold ? 'active' : 'idle'
}

/**
 * R1: should we show the "Are you still there?" warning toast?
 * Returns true when user has been idle for [warningMs, threshold) — between 50 and 60 min
 * by default. Server-side reaper (60 min sustained idle) is the fail-safe.
 */
export function shouldWarnIdle(
    nowMs: number,
    snapshot: ClockSnapshot,
    config: DetectorConfig & { warningMs?: number } = {},
): boolean {
    if (snapshot.state !== 'active' && snapshot.state !== 'idle') return false
    if (snapshot.pausedUntilMs != null && snapshot.pausedUntilMs > nowMs) return false
    if (!snapshot.pageVisible) return false
    const idleFor = nowMs - snapshot.lastActivityMs
    const warning = config.warningMs ?? IDLE_WARNING_MS
    return idleFor >= warning
}

/**
 * Detect sleep/laptop-closed: long gap between expected tick and actual tick.
 * Used to trigger `closed_reason='sleep_detected'` on the next clock-in.
 */
export function isSleepGap({ nowMs, snapshot, config = {} }: DetectorInput): boolean {
    if (snapshot.state === 'stopped') return false
    const interval = config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
    return nowMs - snapshot.lastTickMs > interval * SLEEP_DETECTION_FACTOR
}

/**
 * Compute whether to send `was_active=true` in the next heartbeat.
 * Server should infer the negative — if no heartbeat arrives, the slot is idle.
 * But we still send `was_active=false` heartbeats so server can detect sustained
 * idle (120 consecutive idle heartbeats → auto-close).
 */
export function shouldSendActive({ nowMs, snapshot, config = {} }: DetectorInput): boolean {
    if (snapshot.state === 'stopped') return false
    if (snapshot.pausedUntilMs != null && snapshot.pausedUntilMs > nowMs) return false
    if (!snapshot.pageVisible) return false
    const threshold = config.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS
    return nowMs - snapshot.lastActivityMs <= threshold
}

/**
 * Pure reducer for client-side state transitions.
 * Used by useWorkClock hook to apply events in a predictable way.
 */
export type DetectorEvent =
    | { type: 'start'; ts: number }
    | { type: 'stop' }
    | { type: 'activity'; ts: number }
    | { type: 'visibility'; visible: boolean; ts: number }
    | { type: 'tick'; ts: number; config?: DetectorConfig }
    // R3: explicit user pause + auto-resume
    | { type: 'pause'; ts: number; pausedUntilMs: number }
    | { type: 'resume'; ts: number }

export function detectorReducer(snapshot: ClockSnapshot, event: DetectorEvent): ClockSnapshot {
    switch (event.type) {
        case 'start':
            return {
                state: 'active',
                lastActivityMs: event.ts,
                lastTickMs: event.ts,
                pageVisible: true,
                pausedUntilMs: null,
            }
        case 'stop':
            return { ...snapshot, state: 'stopped', pausedUntilMs: null }
        case 'activity':
            if (snapshot.state === 'stopped') return snapshot
            // While paused, activity does NOT auto-resume (DeskTime convention) — user must explicitly resume
            if (snapshot.pausedUntilMs != null && snapshot.pausedUntilMs > event.ts) {
                return { ...snapshot, lastActivityMs: event.ts }
            }
            return {
                ...snapshot,
                lastActivityMs: event.ts,
                state: snapshot.pageVisible ? 'active' : 'paused_hidden',
            }
        case 'visibility':
            if (snapshot.state === 'stopped') return snapshot
            // Page visibility change while paused: keep paused, just record visibility
            if (snapshot.pausedUntilMs != null && snapshot.pausedUntilMs > event.ts) {
                return { ...snapshot, pageVisible: event.visible }
            }
            return {
                ...snapshot,
                pageVisible: event.visible,
                state: event.visible
                    ? nextState({
                          nowMs: event.ts,
                          snapshot: { ...snapshot, pageVisible: true },
                      })
                    : 'paused_hidden',
            }
        case 'tick':
            // Auto-resume: if pausedUntilMs has passed, clear it
            if (snapshot.pausedUntilMs != null && snapshot.pausedUntilMs <= event.ts) {
                const cleared = { ...snapshot, pausedUntilMs: null, lastActivityMs: event.ts }
                return {
                    ...cleared,
                    state: nextState({ nowMs: event.ts, snapshot: cleared, config: event.config }),
                    lastTickMs: event.ts,
                }
            }
            return {
                ...snapshot,
                state: nextState({ nowMs: event.ts, snapshot, config: event.config }),
                lastTickMs: event.ts,
            }
        case 'pause':
            if (snapshot.state === 'stopped') return snapshot
            return {
                ...snapshot,
                state: 'paused_break',
                pausedUntilMs: event.pausedUntilMs,
            }
        case 'resume':
            if (snapshot.state === 'stopped') return snapshot
            return {
                ...snapshot,
                pausedUntilMs: null,
                lastActivityMs: event.ts,
                state: 'active',
            }
    }
}
