import { describe, expect, it } from 'vitest'
import {
    MAX_PAUSE_MINUTES,
    MIN_PAUSE_MINUTES,
    calculatePausedUntil,
    validatePauseDurationMinutes,
} from '../pause-resume'

describe('validatePauseDurationMinutes', () => {
    it('accepts canonical break presets', () => {
        expect(() => validatePauseDurationMinutes(30)).not.toThrow()
        expect(() => validatePauseDurationMinutes(60)).not.toThrow()
        expect(() => validatePauseDurationMinutes(120)).not.toThrow()
    })

    it('accepts boundaries', () => {
        expect(() => validatePauseDurationMinutes(MIN_PAUSE_MINUTES)).not.toThrow()
        expect(() => validatePauseDurationMinutes(MAX_PAUSE_MINUTES)).not.toThrow()
    })

    it('rejects below minimum', () => {
        expect(() => validatePauseDurationMinutes(0)).toThrow(/1-480/)
        expect(() => validatePauseDurationMinutes(-5)).toThrow(/1-480/)
    })

    it('rejects above maximum', () => {
        expect(() => validatePauseDurationMinutes(481)).toThrow(/1-480/)
        expect(() => validatePauseDurationMinutes(10_000)).toThrow(/1-480/)
    })

    it('rejects NaN and Infinity', () => {
        expect(() => validatePauseDurationMinutes(NaN)).toThrow(/1-480/)
        expect(() => validatePauseDurationMinutes(Infinity)).toThrow(/1-480/)
        expect(() => validatePauseDurationMinutes(-Infinity)).toThrow(/1-480/)
    })
})

describe('calculatePausedUntil', () => {
    it('adds the duration as ISO timestamp', () => {
        const now = new Date('2026-05-11T12:00:00Z').getTime()
        expect(calculatePausedUntil(30, now)).toBe('2026-05-11T12:30:00.000Z')
    })

    it('handles 2-hour pause crossing midnight', () => {
        const now = new Date('2026-05-11T23:00:00Z').getTime()
        expect(calculatePausedUntil(120, now)).toBe('2026-05-12T01:00:00.000Z')
    })

    it('uses Date.now() by default', () => {
        const out = calculatePausedUntil(1)
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
        // The returned timestamp should be within a few seconds of now+1min
        const ms = new Date(out).getTime()
        const expected = Date.now() + 60_000
        expect(Math.abs(ms - expected)).toBeLessThan(5_000)
    })

    it('produces fractional minute precision when supplied', () => {
        const now = new Date('2026-05-11T12:00:00.000Z').getTime()
        // 1.5 minutes = 90 seconds
        expect(calculatePausedUntil(1.5, now)).toBe('2026-05-11T12:01:30.000Z')
    })
})
