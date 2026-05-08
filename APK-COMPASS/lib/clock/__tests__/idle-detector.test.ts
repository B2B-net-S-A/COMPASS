import { describe, expect, it } from 'vitest'
import {
    detectorReducer,
    isSleepGap,
    nextState,
    shouldSendActive,
    DEFAULT_IDLE_THRESHOLD_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    SLEEP_DETECTION_FACTOR,
    type ClockSnapshot,
} from '../idle-detector'

const baseSnapshot: ClockSnapshot = {
    state: 'active',
    lastActivityMs: 1_000_000,
    lastTickMs: 1_000_000,
    pageVisible: true,
}

describe('nextState', () => {
    it('keeps stopped state', () => {
        const result = nextState({
            nowMs: 5_000_000,
            snapshot: { ...baseSnapshot, state: 'stopped' },
        })
        expect(result).toBe('stopped')
    })

    it('returns paused_hidden when page is hidden', () => {
        const result = nextState({
            nowMs: 1_000_000 + 1000,
            snapshot: { ...baseSnapshot, pageVisible: false },
        })
        expect(result).toBe('paused_hidden')
    })

    it('returns active within idle threshold', () => {
        const result = nextState({
            nowMs: baseSnapshot.lastActivityMs + DEFAULT_IDLE_THRESHOLD_MS - 1,
            snapshot: baseSnapshot,
        })
        expect(result).toBe('active')
    })

    it('returns idle past threshold', () => {
        const result = nextState({
            nowMs: baseSnapshot.lastActivityMs + DEFAULT_IDLE_THRESHOLD_MS + 1,
            snapshot: baseSnapshot,
        })
        expect(result).toBe('idle')
    })

    it('treats exactly threshold as still active (boundary)', () => {
        const result = nextState({
            nowMs: baseSnapshot.lastActivityMs + DEFAULT_IDLE_THRESHOLD_MS,
            snapshot: baseSnapshot,
        })
        expect(result).toBe('active')
    })

    it('respects custom threshold', () => {
        const result = nextState({
            nowMs: baseSnapshot.lastActivityMs + 5000,
            snapshot: baseSnapshot,
            config: { idleThresholdMs: 4000 },
        })
        expect(result).toBe('idle')
    })
})

describe('isSleepGap', () => {
    it('returns false when stopped', () => {
        const result = isSleepGap({
            nowMs: baseSnapshot.lastTickMs + 1_000_000,
            snapshot: { ...baseSnapshot, state: 'stopped' },
        })
        expect(result).toBe(false)
    })

    it('returns false when within expected tick interval', () => {
        const result = isSleepGap({
            nowMs: baseSnapshot.lastTickMs + DEFAULT_HEARTBEAT_INTERVAL_MS * 2,
            snapshot: baseSnapshot,
        })
        expect(result).toBe(false)
    })

    it('returns true past sleep factor (5× heartbeat)', () => {
        const gap = DEFAULT_HEARTBEAT_INTERVAL_MS * SLEEP_DETECTION_FACTOR + 1
        const result = isSleepGap({
            nowMs: baseSnapshot.lastTickMs + gap,
            snapshot: baseSnapshot,
        })
        expect(result).toBe(true)
    })
})

describe('shouldSendActive', () => {
    it('false when stopped', () => {
        expect(
            shouldSendActive({
                nowMs: 5_000_000,
                snapshot: { ...baseSnapshot, state: 'stopped' },
            }),
        ).toBe(false)
    })

    it('false when page hidden', () => {
        expect(
            shouldSendActive({
                nowMs: 1_000_000,
                snapshot: { ...baseSnapshot, pageVisible: false },
            }),
        ).toBe(false)
    })

    it('true when active and recent activity', () => {
        expect(
            shouldSendActive({
                nowMs: baseSnapshot.lastActivityMs + 1000,
                snapshot: baseSnapshot,
            }),
        ).toBe(true)
    })

    it('false when past idle threshold', () => {
        expect(
            shouldSendActive({
                nowMs: baseSnapshot.lastActivityMs + DEFAULT_IDLE_THRESHOLD_MS + 1,
                snapshot: baseSnapshot,
            }),
        ).toBe(false)
    })
})

describe('detectorReducer', () => {
    it('start transitions from stopped to active', () => {
        const result = detectorReducer(
            { ...baseSnapshot, state: 'stopped' },
            { type: 'start', ts: 2_000_000 },
        )
        expect(result.state).toBe('active')
        expect(result.lastActivityMs).toBe(2_000_000)
        expect(result.pageVisible).toBe(true)
    })

    it('stop transitions to stopped', () => {
        const result = detectorReducer(baseSnapshot, { type: 'stop' })
        expect(result.state).toBe('stopped')
    })

    it('activity ignored when stopped', () => {
        const stopped: ClockSnapshot = { ...baseSnapshot, state: 'stopped' }
        const result = detectorReducer(stopped, { type: 'activity', ts: 5_000_000 })
        expect(result).toBe(stopped) // same reference
    })

    it('activity updates lastActivity and goes active when visible', () => {
        const idle: ClockSnapshot = { ...baseSnapshot, state: 'idle' }
        const result = detectorReducer(idle, { type: 'activity', ts: 5_000_000 })
        expect(result.state).toBe('active')
        expect(result.lastActivityMs).toBe(5_000_000)
    })

    it('activity goes paused_hidden when not visible', () => {
        const hidden: ClockSnapshot = { ...baseSnapshot, pageVisible: false, state: 'paused_hidden' }
        const result = detectorReducer(hidden, { type: 'activity', ts: 5_000_000 })
        expect(result.state).toBe('paused_hidden')
        expect(result.lastActivityMs).toBe(5_000_000)
    })

    it('visibility=false forces paused_hidden', () => {
        const result = detectorReducer(baseSnapshot, {
            type: 'visibility',
            visible: false,
            ts: 5_000_000,
        })
        expect(result.state).toBe('paused_hidden')
        expect(result.pageVisible).toBe(false)
    })

    it('visibility=true returns to active when within threshold', () => {
        const hidden: ClockSnapshot = { ...baseSnapshot, pageVisible: false, state: 'paused_hidden' }
        const result = detectorReducer(hidden, {
            type: 'visibility',
            visible: true,
            ts: hidden.lastActivityMs + 1000,
        })
        expect(result.state).toBe('active')
    })

    it('visibility=true returns to idle when past threshold', () => {
        const hidden: ClockSnapshot = { ...baseSnapshot, pageVisible: false, state: 'paused_hidden' }
        const result = detectorReducer(hidden, {
            type: 'visibility',
            visible: true,
            ts: hidden.lastActivityMs + DEFAULT_IDLE_THRESHOLD_MS + 1,
        })
        expect(result.state).toBe('idle')
    })

    it('tick recomputes state and updates lastTick', () => {
        const result = detectorReducer(baseSnapshot, {
            type: 'tick',
            ts: baseSnapshot.lastActivityMs + DEFAULT_IDLE_THRESHOLD_MS + 1,
        })
        expect(result.state).toBe('idle')
        expect(result.lastTickMs).toBe(baseSnapshot.lastActivityMs + DEFAULT_IDLE_THRESHOLD_MS + 1)
    })

    it('tick keeps stopped when stopped', () => {
        const stopped: ClockSnapshot = { ...baseSnapshot, state: 'stopped' }
        const result = detectorReducer(stopped, { type: 'tick', ts: 5_000_000 })
        expect(result.state).toBe('stopped')
    })
})
