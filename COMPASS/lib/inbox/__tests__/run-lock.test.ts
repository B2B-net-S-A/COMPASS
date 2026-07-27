import { describe, it, expect } from 'vitest'
import { isRunInProgress, STALE_RUN_MS } from '../run-lock'

const NOW = Date.parse('2026-07-27T12:00:00Z')
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

describe('isRunInProgress', () => {
    it('reports idle when no run was ever claimed', () => {
        expect(isRunInProgress(null, null, NOW)).toBe(false)
        expect(isRunInProgress(undefined, undefined, NOW)).toBe(false)
    })

    it('reports in progress for a fresh claim with no finish yet', () => {
        // The real case: 12:00 tick firing while the 11:55 run is still working.
        expect(isRunInProgress(iso(-3 * 60_000), null, NOW)).toBe(true)
    })

    it('reports idle once the run finished after it started', () => {
        expect(isRunInProgress(iso(-4 * 60_000), iso(-1 * 60_000), NOW)).toBe(false)
    })

    it('reports in progress when the finish predates the current start', () => {
        // last_run_at left over from the PREVIOUS run — must not clear this one.
        expect(isRunInProgress(iso(-2 * 60_000), iso(-9 * 60_000), NOW)).toBe(true)
    })

    it('treats a finish stamped at the exact start time as finished', () => {
        const t = iso(-60_000)
        expect(isRunInProgress(t, t, NOW)).toBe(false)
    })

    it('lets an expired claim go, so a killed run cannot block forever', () => {
        expect(isRunInProgress(iso(-STALE_RUN_MS - 1000), null, NOW)).toBe(false)
    })

    it('still holds just inside the expiry window', () => {
        expect(isRunInProgress(iso(-STALE_RUN_MS + 1000), null, NOW)).toBe(true)
    })

    it('ignores unparseable timestamps rather than blocking the ingest', () => {
        expect(isRunInProgress('not-a-date', null, NOW)).toBe(false)
        // A bad finish must not resurrect an otherwise-live claim.
        expect(isRunInProgress(iso(-60_000), 'not-a-date', NOW)).toBe(true)
    })
})
