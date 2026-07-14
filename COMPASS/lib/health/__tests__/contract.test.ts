import { describe, expect, it } from 'vitest'
import {
    deriveReadinessStatus,
    hasValidReleaseMetadata,
} from '../contract'

describe('health contract', () => {
    it('uses degraded only for a non-critical dependency failure', () => {
        expect(deriveReadinessStatus(['healthy'], ['unhealthy'])).toBe('degraded')
        expect(deriveReadinessStatus(['unhealthy'], ['healthy'])).toBe('unhealthy')
        expect(deriveReadinessStatus(['healthy'], ['healthy'])).toBe('healthy')
    })

    it('requires a full Git SHA and an actual UTC build timestamp', () => {
        expect(hasValidReleaseMetadata({
            version: 'c'.repeat(40),
            deployedAt: '2026-07-13T10:20:30Z',
        })).toBe(true)
        expect(hasValidReleaseMetadata({
            version: 'c'.repeat(7),
            deployedAt: '2026-07-13T10:20:30Z',
        })).toBe(false)
        expect(hasValidReleaseMetadata({
            version: 'c'.repeat(40),
            deployedAt: 'not-a-date',
        })).toBe(false)
        expect(hasValidReleaseMetadata({
            version: 'c'.repeat(40),
            deployedAt: '2026-02-31T10:20:30Z',
        })).toBe(false)
    })
})
