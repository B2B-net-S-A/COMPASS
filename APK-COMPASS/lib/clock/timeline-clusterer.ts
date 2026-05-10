// Phase 17b R12 — Pure timeline clusterer.
//
// Inputs:
//   - heartbeats (every 30s) with was_active flag
//   - route metadata (every 5-min bucket, route_path + page_title)
//
// Output: array of contiguous TimelineBlock — adjacent buckets that share
// the same dominant route_path are merged into one block. Blocks with no
// route metadata fallback to "Praca standardowa".
//
// This is a deliberately simple greedy clusterer (NO ML/embeddings) — keeps
// the algorithm understandable and testable. Future: Timely-style topic
// extraction would require LLM call + larger context window per session.

export interface ClustererHeartbeat {
    ts: string | Date
    was_active: boolean
}

export interface ClustererRoute {
    ts_bucket_5min: string | Date
    route_path: string
    page_title?: string | null
}

export interface TimelineBlock {
    /** ISO start time */
    start: string
    /** ISO end time (exclusive) */
    end: string
    /** Active seconds in this block (computed from heartbeats overlapping the bucket) */
    activeSeconds: number
    /** Dominant route_path or null when no metadata */
    primaryRoute: string | null
    /** Friendly label derived from route + page_title */
    label: string
}

const BUCKET_MS = 5 * 60 * 1000

function toMs(ts: string | Date): number {
    return ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
}

/**
 * Bucket heartbeats into 5-min slots and pair with dominant route per bucket.
 * Returns one TimelineBlock per contiguous run of buckets sharing the same route.
 *
 * If routeMeta is empty, returns a single block "Praca standardowa" spanning
 * from first heartbeat to last (or null if no heartbeats).
 */
export function clusterTimeline(
    heartbeats: ReadonlyArray<ClustererHeartbeat>,
    routeMeta: ReadonlyArray<ClustererRoute>,
): TimelineBlock[] {
    if (heartbeats.length === 0) return []

    // 1. Compute active seconds per 5-min bucket
    const HEARTBEAT_INTERVAL_S = 30
    const activeByBucket = new Map<number, number>()
    for (const hb of heartbeats) {
        if (!hb.was_active) continue
        const ts = toMs(hb.ts)
        const bucketKey = Math.floor(ts / BUCKET_MS) * BUCKET_MS
        activeByBucket.set(bucketKey, (activeByBucket.get(bucketKey) ?? 0) + HEARTBEAT_INTERVAL_S)
    }

    if (activeByBucket.size === 0) return []

    // 2. Pick dominant route per bucket (tie-break: alphabetical for determinism)
    const routesByBucket = new Map<number, Map<string, { count: number; title: string | null }>>()
    for (const r of routeMeta) {
        const ts = toMs(r.ts_bucket_5min)
        const bucketKey = Math.floor(ts / BUCKET_MS) * BUCKET_MS
        const m = routesByBucket.get(bucketKey) ?? new Map<string, { count: number; title: string | null }>()
        const existing = m.get(r.route_path) ?? { count: 0, title: r.page_title ?? null }
        existing.count += 1
        if (r.page_title) existing.title = r.page_title
        m.set(r.route_path, existing)
        routesByBucket.set(bucketKey, m)
    }

    function dominantRoute(bucket: number): { path: string; title: string | null } | null {
        const m = routesByBucket.get(bucket)
        if (!m || m.size === 0) return null
        type Best = { path: string; count: number; title: string | null }
        let best: Best | null = null
        m.forEach((info, path) => {
            const isBetter =
                best === null ||
                info.count > best.count ||
                (info.count === best.count && path < best.path)
            if (isBetter) {
                best = { path, count: info.count, title: info.title }
            }
        })
        if (best === null) return null
        const out: { path: string; title: string | null } = {
            path: (best as Best).path,
            title: (best as Best).title,
        }
        return out
    }

    // 3. Walk buckets in order, merge contiguous same-route runs into TimelineBlocks
    const sortedBuckets = Array.from(activeByBucket.keys()).sort((a, b) => a - b)
    const blocks: TimelineBlock[] = []
    let current: {
        start: number
        end: number
        active: number
        path: string | null
        title: string | null
    } | null = null

    for (const bucket of sortedBuckets) {
        const dom = dominantRoute(bucket)
        const path = dom?.path ?? null
        const title = dom?.title ?? null
        const active = activeByBucket.get(bucket) ?? 0

        if (current && current.path === path && bucket === current.end) {
            // contiguous bucket with same route — extend
            current.end = bucket + BUCKET_MS
            current.active += active
            if (title && !current.title) current.title = title
        } else {
            // new block
            if (current) {
                blocks.push(toBlock(current))
            }
            current = {
                start: bucket,
                end: bucket + BUCKET_MS,
                active,
                path,
                title,
            }
        }
    }
    if (current) blocks.push(toBlock(current))

    return blocks
}

function toBlock(c: {
    start: number
    end: number
    active: number
    path: string | null
    title: string | null
}): TimelineBlock {
    return {
        start: new Date(c.start).toISOString(),
        end: new Date(c.end).toISOString(),
        activeSeconds: c.active,
        primaryRoute: c.path,
        label: friendlyLabel(c.path, c.title),
    }
}

function friendlyLabel(path: string | null, title: string | null): string {
    if (title) return title
    if (!path) return 'Praca standardowa'
    // Derive from path: /internal/akademia → Akademia, /internal → Strefa wewnętrzna
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) return 'Strefa główna'
    const last = segments[segments.length - 1]
    return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ')
}
