import { describe, expect, it } from 'vitest'
import { addPolishBusinessDays, isPolishHoliday } from '../business-days'

describe('isPolishHoliday', () => {
    it('returns true for hardcoded 2026 holidays', () => {
        expect(isPolishHoliday(new Date('2026-01-01T00:00:00Z'))).toBe(true)
        expect(isPolishHoliday(new Date('2026-04-06T00:00:00Z'))).toBe(true)
        expect(isPolishHoliday(new Date('2026-12-25T00:00:00Z'))).toBe(true)
    })

    it('returns false for ordinary days', () => {
        expect(isPolishHoliday(new Date('2026-05-06T00:00:00Z'))).toBe(false)
        expect(isPolishHoliday(new Date('2026-07-15T00:00:00Z'))).toBe(false)
    })
})

describe('addPolishBusinessDays', () => {
    it('skips weekend — Friday + 2 days lands on Tuesday', () => {
        const friday = new Date('2026-05-08T10:00:00Z')
        const result = addPolishBusinessDays(friday, 2)
        expect(result.toISOString().slice(0, 10)).toBe('2026-05-12') // Tue
    })

    it('skips Easter Monday — Friday 2026-04-03 + 1 day → Tuesday 2026-04-07', () => {
        const goodFriday = new Date('2026-04-03T10:00:00Z')
        const result = addPolishBusinessDays(goodFriday, 1)
        expect(result.toISOString().slice(0, 10)).toBe('2026-04-07')
    })

    it('Wednesday 2026-05-06 + 2 days → Friday 2026-05-08 (no skip)', () => {
        const wed = new Date('2026-05-06T10:00:00Z')
        const result = addPolishBusinessDays(wed, 2)
        expect(result.toISOString().slice(0, 10)).toBe('2026-05-08')
    })

    it('crosses 1.05 + 3.05 holidays — Wednesday 2026-04-29 + 5 days → Wednesday 2026-05-13 (skip pt 1.05 + nd 3.05 already weekend, actually 2026-05-03 is Sunday)', () => {
        // 2026-04-29 (Wed) +5 working days, skipping: 1.05 (Fri, holiday), Sat-Sun, 3.05 (Sun already weekend), then weekdays
        // Step: 30 (Thu), 4 (Mon), 5 (Tue), 6 (Wed), 7 (Thu)
        const wed = new Date('2026-04-29T10:00:00Z')
        const result = addPolishBusinessDays(wed, 5)
        expect(result.toISOString().slice(0, 10)).toBe('2026-05-07')
    })

    it('returns same date when days = 0', () => {
        const d = new Date('2026-05-06T10:00:00Z')
        const result = addPolishBusinessDays(d, 0)
        expect(result.getTime()).toBe(d.getTime())
    })

    it('throws on negative days', () => {
        expect(() => addPolishBusinessDays(new Date(), -1)).toThrow()
    })
})
