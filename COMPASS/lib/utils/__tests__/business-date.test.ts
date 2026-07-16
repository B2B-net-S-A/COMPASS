import { describe, expect, it } from 'vitest'
import { businessTodayISO, isDateOverdue } from '../business-date'

describe('businessTodayISO', () => {
    it('zwraca datę warszawską, nie UTC — wieczór UTC latem to już następny dzień w PL', () => {
        // 2026-07-15 22:30 UTC = 2026-07-16 00:30 CEST
        expect(businessTodayISO(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
    })

    it('zimą (CET, UTC+1) przeskakuje dzień po 23:00 UTC', () => {
        expect(businessTodayISO(new Date('2026-01-10T23:30:00Z'))).toBe('2026-01-11')
        expect(businessTodayISO(new Date('2026-01-10T22:30:00Z'))).toBe('2026-01-10')
    })

    it('środek dnia pozostaje tym samym dniem', () => {
        expect(businessTodayISO(new Date('2026-07-16T10:00:00Z'))).toBe('2026-07-16')
    })
})

describe('isDateOverdue', () => {
    const today = '2026-07-16'

    it('termin dzisiejszy NIE jest overdue (kontrakt due today ≠ overdue)', () => {
        expect(isDateOverdue('2026-07-16', today)).toBe(false)
    })

    it('termin wczorajszy jest overdue', () => {
        expect(isDateOverdue('2026-07-15', today)).toBe(true)
    })

    it('termin przyszły nie jest overdue', () => {
        expect(isDateOverdue('2026-07-17', today)).toBe(false)
    })

    it('brak terminu nie jest overdue', () => {
        expect(isDateOverdue(null, today)).toBe(false)
        expect(isDateOverdue(undefined, today)).toBe(false)
    })

    it('obcina timestamp do daty przed porównaniem', () => {
        expect(isDateOverdue('2026-07-15T23:59:59Z', today)).toBe(true)
        expect(isDateOverdue('2026-07-16T00:00:00Z', today)).toBe(false)
    })
})
