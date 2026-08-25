import { describe, expect, it } from 'vitest'
import { addPolishBusinessDays, isPolishHoliday } from '../business-days'

describe('isPolishHoliday', () => {
    it('returns true for hardcoded 2026 holidays', () => {
        expect(isPolishHoliday(new Date('2026-01-01T00:00:00Z'))).toBe(true)
        expect(isPolishHoliday(new Date('2026-04-06T00:00:00Z'))).toBe(true)
        expect(isPolishHoliday(new Date('2026-12-25T00:00:00Z'))).toBe(true)
    })

    it('zna święta 2028-2030 — lista nie kończy się na 2027', () => {
        // Kalendarz miał twardy koniec na 2027-12-26; od 2028-01-01 każde święto
        // liczyło się jako zwykły dzień roboczy (SLA, prognoza 168h).
        expect(isPolishHoliday(new Date('2028-04-17T00:00:00Z'))).toBe(true) // Wielkanocny Pn
        expect(isPolishHoliday(new Date('2028-06-15T00:00:00Z'))).toBe(true) // Boże Ciało
        expect(isPolishHoliday(new Date('2029-05-31T00:00:00Z'))).toBe(true)
        expect(isPolishHoliday(new Date('2030-06-20T00:00:00Z'))).toBe(true)
    })

    it('czyta datę z kalendarza lokalnego, nie z UTC', () => {
        // `new Date(2026, 0, 6)` to lokalna północ. Przez `toISOString()` w strefie
        // Europe/Warsaw wychodziło z tego 2026-01-05 i święto znikało.
        expect(isPolishHoliday(new Date(2026, 0, 6))).toBe(true)
        expect(isPolishHoliday(new Date(2026, 3, 6))).toBe(true)
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
