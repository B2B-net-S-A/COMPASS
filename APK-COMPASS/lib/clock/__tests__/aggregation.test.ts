import { describe, expect, it } from 'vitest'
import {
    aggregateHeartbeats,
    isCorrectionRequired,
    isSustainedIdle,
    HEARTBEAT_INTERVAL_SECONDS,
    DISCREPANCY_THRESHOLD_HOURS,
    KP_DAILY_HOURS_LIMIT,
} from '../aggregation'

describe('aggregateHeartbeats', () => {
    it('returns zeros for empty list', () => {
        expect(aggregateHeartbeats([])).toEqual({
            activeSeconds: 0,
            idleSeconds: 0,
            totalHeartbeats: 0,
            activeHeartbeats: 0,
        })
    })

    it('counts each heartbeat as 30s of active or idle time', () => {
        const result = aggregateHeartbeats([
            { ts: '2026-05-08T10:00:00Z', was_active: true },
            { ts: '2026-05-08T10:00:30Z', was_active: true },
            { ts: '2026-05-08T10:01:00Z', was_active: false },
        ])
        expect(result.activeSeconds).toBe(2 * HEARTBEAT_INTERVAL_SECONDS)
        expect(result.idleSeconds).toBe(HEARTBEAT_INTERVAL_SECONDS)
        expect(result.totalHeartbeats).toBe(3)
        expect(result.activeHeartbeats).toBe(2)
    })

    it('deduplicates heartbeats with the same ts (defensive)', () => {
        const result = aggregateHeartbeats([
            { ts: '2026-05-08T10:00:00Z', was_active: true },
            { ts: '2026-05-08T10:00:00Z', was_active: true }, // duplicate
        ])
        expect(result.activeHeartbeats).toBe(1)
        expect(result.activeSeconds).toBe(HEARTBEAT_INTERVAL_SECONDS)
    })

    it('handles Date objects and strings interchangeably', () => {
        const result = aggregateHeartbeats([
            { ts: new Date('2026-05-08T10:00:00Z'), was_active: true },
            { ts: '2026-05-08T10:00:30Z', was_active: false },
        ])
        expect(result.totalHeartbeats).toBe(2)
    })
})

describe('isSustainedIdle', () => {
    it('returns false when not enough heartbeats', () => {
        const heartbeats = Array.from({ length: 50 }, (_, i) => ({
            ts: new Date(2026, 4, 8, 10, 0, i * 30).toISOString(),
            was_active: false,
        }))
        expect(isSustainedIdle(heartbeats)).toBe(false)
    })

    it('returns true when last 120 heartbeats are all idle', () => {
        const heartbeats = Array.from({ length: 130 }, (_, i) => ({
            ts: new Date(2026, 4, 8, 10, 0, i * 30).toISOString(),
            was_active: i < 10, // first 10 active, rest 120 idle
        }))
        expect(isSustainedIdle(heartbeats)).toBe(true)
    })

    it('returns false when any of the last 120 heartbeats was active', () => {
        const heartbeats = Array.from({ length: 130 }, (_, i) => ({
            ts: new Date(2026, 4, 8, 10, 0, i * 30).toISOString(),
            was_active: i === 100, // one active in middle of tail
        }))
        expect(isSustainedIdle(heartbeats)).toBe(false)
    })

    it('handles unsorted input', () => {
        const heartbeats = Array.from({ length: 130 }, (_, i) => ({
            ts: new Date(2026, 4, 8, 10, 0, i * 30).toISOString(),
            was_active: i < 10,
        }))
        // Shuffle
        heartbeats.reverse()
        expect(isSustainedIdle(heartbeats)).toBe(true)
    })

    it('respects custom window size', () => {
        const heartbeats = Array.from({ length: 5 }, () => ({
            ts: new Date().toISOString(),
            was_active: false,
        }))
        expect(isSustainedIdle(heartbeats, 5)).toBe(true)
        expect(isSustainedIdle(heartbeats, 6)).toBe(false)
    })
})

describe('isCorrectionRequired', () => {
    it('flags when declared exceeds KP daily limit (13h)', () => {
        expect(isCorrectionRequired(KP_DAILY_HOURS_LIMIT + 0.5, 8)).toBe(true)
        expect(isCorrectionRequired(14, null)).toBe(true)
    })

    it('does not flag when tracked is null and declared is within KP limit', () => {
        expect(isCorrectionRequired(8, null)).toBe(false)
        expect(isCorrectionRequired(13, null)).toBe(false)
    })

    it('flags when |declared - tracked| exceeds threshold', () => {
        expect(isCorrectionRequired(8, 6)).toBe(true) // diff 2.0 > 1.0
        expect(isCorrectionRequired(6, 8)).toBe(true) // diff 2.0 > 1.0
    })

    it('does not flag when diff is within threshold', () => {
        expect(isCorrectionRequired(8, 8)).toBe(false)
        expect(isCorrectionRequired(8, 7)).toBe(false) // diff 1.0 == threshold (not >)
        expect(isCorrectionRequired(8, 7.5)).toBe(false)
    })

    it('respects custom threshold', () => {
        // diff = 0.4 within 0.5 threshold → not flagged
        expect(isCorrectionRequired(8, 7.6, 0.5)).toBe(false)
        // diff = 0.6 over 0.5 threshold → flagged
        expect(isCorrectionRequired(8, 7.4, 0.5)).toBe(true)
    })

    it('flags 14h declared even if tracked is exactly 14h (KP cap takes priority)', () => {
        expect(isCorrectionRequired(14, 14)).toBe(true)
    })

    it('uses default threshold constant', () => {
        expect(DISCREPANCY_THRESHOLD_HOURS).toBe(1.0)
    })
})
