import { describe, expect, it } from 'vitest'
import {
    detectorReducer,
    isSleepGap,
    nextState,
    shouldSendActive,
    shouldWarnIdle,
    pauseReasonForDuration,
    DEFAULT_IDLE_THRESHOLD_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    IDLE_WARNING_MS,
    SLEEP_DETECTION_FACTOR,
    type ClockSnapshot,
} from '../idle-detector'

const baseSnapshot: ClockSnapshot = {
    state: 'active',
    lastActivityMs: 1_000_000,
    lastTickMs: 1_000_000,
    pageVisible: true,
    pausedUntilMs: null,
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

describe('shouldWarnIdle (R1)', () => {
    it('false when stopped', () => {
        expect(
            shouldWarnIdle(5_000_000, { ...baseSnapshot, state: 'stopped' }),
        ).toBe(false)
    })

    it('false when paused (R3 wins)', () => {
        expect(
            shouldWarnIdle(baseSnapshot.lastActivityMs + IDLE_WARNING_MS + 1, {
                ...baseSnapshot,
                pausedUntilMs: 999_999_999_999,
            }),
        ).toBe(false)
    })

    it('false when page hidden', () => {
        expect(
            shouldWarnIdle(baseSnapshot.lastActivityMs + IDLE_WARNING_MS + 1, {
                ...baseSnapshot,
                pageVisible: false,
            }),
        ).toBe(false)
    })

    it('false before warning threshold', () => {
        expect(
            shouldWarnIdle(baseSnapshot.lastActivityMs + IDLE_WARNING_MS - 1, baseSnapshot),
        ).toBe(false)
    })

    it('true at exactly warning threshold', () => {
        expect(
            shouldWarnIdle(baseSnapshot.lastActivityMs + IDLE_WARNING_MS, baseSnapshot),
        ).toBe(true)
    })

    it('true past warning threshold', () => {
        expect(
            shouldWarnIdle(baseSnapshot.lastActivityMs + IDLE_WARNING_MS + 60_000, baseSnapshot),
        ).toBe(true)
    })

    it('respects custom warning ms', () => {
        expect(
            shouldWarnIdle(baseSnapshot.lastActivityMs + 5000, baseSnapshot, { warningMs: 4000 }),
        ).toBe(true)
    })
})

describe('pauseReasonForDuration (R3)', () => {
    it('maps preset durations', () => {
        expect(pauseReasonForDuration(30)).toBe('break_30')
        expect(pauseReasonForDuration(60)).toBe('break_60')
        expect(pauseReasonForDuration(120)).toBe('break_120')
    })
    it('falls back to manual for non-preset', () => {
        expect(pauseReasonForDuration(45)).toBe('manual')
        expect(pauseReasonForDuration(15)).toBe('manual')
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

    // R3 pause / resume tests
    it('pause sets state to paused_break and pausedUntilMs', () => {
        const result = detectorReducer(baseSnapshot, {
            type: 'pause',
            ts: 1_000_000,
            pausedUntilMs: 5_000_000,
        })
        expect(result.state).toBe('paused_break')
        expect(result.pausedUntilMs).toBe(5_000_000)
    })

    it('resume clears pausedUntilMs and goes active', () => {
        const paused: ClockSnapshot = {
            ...baseSnapshot,
            state: 'paused_break',
            pausedUntilMs: 5_000_000,
        }
        const result = detectorReducer(paused, { type: 'resume', ts: 6_000_000 })
        expect(result.state).toBe('active')
        expect(result.pausedUntilMs).toBeNull()
        expect(result.lastActivityMs).toBe(6_000_000)
    })

    it('tick auto-resumes after pausedUntilMs has elapsed', () => {
        const paused: ClockSnapshot = {
            ...baseSnapshot,
            state: 'paused_break',
            pausedUntilMs: 1_000_000,
        }
        const result = detectorReducer(paused, { type: 'tick', ts: 1_500_000 })
        expect(result.pausedUntilMs).toBeNull()
        expect(result.state).toBe('active')
    })

    it('activity during pause does NOT exit pause (DeskTime convention)', () => {
        const paused: ClockSnapshot = {
            ...baseSnapshot,
            state: 'paused_break',
            pausedUntilMs: 5_000_000,
        }
        const result = detectorReducer(paused, { type: 'activity', ts: 2_000_000 })
        expect(result.state).toBe('paused_break')
        expect(result.pausedUntilMs).toBe(5_000_000)
        expect(result.lastActivityMs).toBe(2_000_000)
    })

    it('pause ignored when stopped', () => {
        const stopped: ClockSnapshot = { ...baseSnapshot, state: 'stopped' }
        const result = detectorReducer(stopped, {
            type: 'pause',
            ts: 1_000_000,
            pausedUntilMs: 5_000_000,
        })
        expect(result.state).toBe('stopped')
    })

    it('nextState returns paused_break when pausedUntilMs in future', () => {
        const result = nextState({
            nowMs: 1_000_000,
            snapshot: { ...baseSnapshot, pausedUntilMs: 5_000_000 },
        })
        expect(result).toBe('paused_break')
    })

    it('shouldSendActive false when paused', () => {
        expect(
            shouldSendActive({
                nowMs: 1_000_000,
                snapshot: { ...baseSnapshot, pausedUntilMs: 5_000_000 },
            }),
        ).toBe(false)
    })
})
