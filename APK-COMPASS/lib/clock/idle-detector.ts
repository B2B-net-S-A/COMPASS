// Phase 17 — Pure idle-detector state machine for the client-side clock hook.
// Decoupled from React/DOM so it's unit-testable without happy-dom.

export const DEFAULT_IDLE_THRESHOLD_MS = 20 * 60 * 1000 // 20 min
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 1000  // 30s
export const SLEEP_DETECTION_FACTOR = 5                  // gap > 5× heartbeat = sleep

export type ClockState = 'stopped' | 'active' | 'idle' | 'paused_hidden'

export interface ClockSnapshot {
    state: ClockState
    lastActivityMs: number
    lastTickMs: number
    pageVisible: boolean
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
 * Rules:
 *  - If state is 'stopped' → stays stopped (only start() transitions out)
 *  - If !pageVisible → 'paused_hidden' (don't count time, don't send wasActive=true)
 *  - If pageVisible && (now - lastActivity) <= threshold → 'active'
 *  - If pageVisible && (now - lastActivity) > threshold → 'idle'
 */
export function nextState({ nowMs, snapshot, config = {} }: DetectorInput): ClockState {
    const threshold = config.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS
    if (snapshot.state === 'stopped') return 'stopped'
    if (!snapshot.pageVisible) return 'paused_hidden'
    return nowMs - snapshot.lastActivityMs <= threshold ? 'active' : 'idle'
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

export function detectorReducer(snapshot: ClockSnapshot, event: DetectorEvent): ClockSnapshot {
    switch (event.type) {
        case 'start':
            return {
                state: 'active',
                lastActivityMs: event.ts,
                lastTickMs: event.ts,
                pageVisible: true,
            }
        case 'stop':
            return { ...snapshot, state: 'stopped' }
        case 'activity':
            if (snapshot.state === 'stopped') return snapshot
            return {
                ...snapshot,
                lastActivityMs: event.ts,
                state: snapshot.pageVisible ? 'active' : 'paused_hidden',
            }
        case 'visibility':
            if (snapshot.state === 'stopped') return snapshot
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
            return {
                ...snapshot,
                state: nextState({ nowMs: event.ts, snapshot, config: event.config }),
                lastTickMs: event.ts,
            }
    }
}
