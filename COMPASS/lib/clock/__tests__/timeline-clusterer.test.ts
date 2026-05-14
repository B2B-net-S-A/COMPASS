import { describe, expect, it } from 'vitest'
import { clusterTimeline } from '../timeline-clusterer'

const FIVE_MIN_MS = 5 * 60 * 1000

function bucketStart(d: Date): Date {
    const ms = Math.floor(d.getTime() / FIVE_MIN_MS) * FIVE_MIN_MS
    return new Date(ms)
}

describe('clusterTimeline (R12)', () => {
    it('returns empty when no heartbeats', () => {
        const result = clusterTimeline([], [{ ts_bucket_5min: '2026-05-08T10:00:00Z', route_path: '/internal' }])
        expect(result).toEqual([])
    })

    it('returns empty when heartbeats exist but none was_active=true', () => {
        const result = clusterTimeline(
            [{ ts: '2026-05-08T10:00:00Z', was_active: false }],
            [],
        )
        expect(result).toEqual([])
    })

    it('returns fallback blocks when no route metadata', () => {
        const heartbeats = [
            { ts: '2026-05-08T10:00:00Z', was_active: true },
            { ts: '2026-05-08T10:00:30Z', was_active: true },
            { ts: '2026-05-08T10:05:00Z', was_active: true },
        ]
        const result = clusterTimeline(heartbeats, [])
        // Both buckets have null primaryRoute → contiguous merge into 1 block
        expect(result).toHaveLength(1)
        expect(result[0].label).toBe('Praca standardowa')
    })

    it('merges contiguous same-route buckets into one block', () => {
        const t0 = bucketStart(new Date('2026-05-08T10:00:00Z'))
        const t1 = bucketStart(new Date('2026-05-08T10:05:00Z'))
        const t2 = bucketStart(new Date('2026-05-08T10:10:00Z'))
        const result = clusterTimeline(
            [
                { ts: t0, was_active: true },
                { ts: t1, was_active: true },
                { ts: t2, was_active: true },
            ],
            [
                { ts_bucket_5min: t0, route_path: '/internal/akademia', page_title: 'Akademia' },
                { ts_bucket_5min: t1, route_path: '/internal/akademia', page_title: 'Akademia' },
                { ts_bucket_5min: t2, route_path: '/internal/akademia', page_title: 'Akademia' },
            ],
        )
        expect(result).toHaveLength(1)
        expect(result[0].primaryRoute).toBe('/internal/akademia')
        expect(result[0].label).toBe('Akademia')
        expect(result[0].activeSeconds).toBe(3 * 30)
    })

    it('splits when route changes', () => {
        const t0 = bucketStart(new Date('2026-05-08T10:00:00Z'))
        const t1 = bucketStart(new Date('2026-05-08T10:05:00Z'))
        const t2 = bucketStart(new Date('2026-05-08T10:10:00Z'))
        const result = clusterTimeline(
            [
                { ts: t0, was_active: true },
                { ts: t1, was_active: true },
                { ts: t2, was_active: true },
            ],
            [
                { ts_bucket_5min: t0, route_path: '/internal/akademia' },
                { ts_bucket_5min: t1, route_path: '/internal/akademia' },
                { ts_bucket_5min: t2, route_path: '/internal/timesheet' },
            ],
        )
        expect(result).toHaveLength(2)
        expect(result[0].primaryRoute).toBe('/internal/akademia')
        expect(result[1].primaryRoute).toBe('/internal/timesheet')
    })

    it('picks dominant route when bucket has multiple routes', () => {
        const t0 = bucketStart(new Date('2026-05-08T10:00:00Z'))
        const result = clusterTimeline(
            [{ ts: t0, was_active: true }],
            [
                { ts_bucket_5min: t0, route_path: '/internal/akademia' },
                { ts_bucket_5min: t0, route_path: '/internal/akademia' },
                { ts_bucket_5min: t0, route_path: '/internal/timesheet' },
            ],
        )
        expect(result).toHaveLength(1)
        expect(result[0].primaryRoute).toBe('/internal/akademia')
    })

    it('skips buckets with no active heartbeats', () => {
        const t0 = bucketStart(new Date('2026-05-08T10:00:00Z'))
        const t1 = bucketStart(new Date('2026-05-08T10:05:00Z'))
        const result = clusterTimeline(
            [
                { ts: t0, was_active: true },
                { ts: t1, was_active: false },
            ],
            [
                { ts_bucket_5min: t0, route_path: '/internal/akademia' },
                { ts_bucket_5min: t1, route_path: '/internal/timesheet' },
            ],
        )
        expect(result).toHaveLength(1)
        expect(result[0].primaryRoute).toBe('/internal/akademia')
    })
})
