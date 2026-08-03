import { describe, expect, it } from 'vitest'

import { daysBetween, isFresh, isStale } from '@/lib/tech-map/freshness'

const TODAY = '2026-08-03'

describe('daysBetween', () => {
    it('liczy pełne dni w przód', () => {
        expect(daysBetween('2026-08-01', TODAY)).toBe(2)
    })

    it('ta sama data = 0', () => {
        expect(daysBetween(TODAY, TODAY)).toBe(0)
    })

    it('ujemne, gdy from po to', () => {
        expect(daysBetween('2026-08-05', TODAY)).toBe(-2)
    })
})

describe('isStale (próg 6 miesięcy)', () => {
    it('brak wpisu jest przeterminowany', () => {
        expect(isStale(null, TODAY)).toBe(true)
    })

    it('wpis sprzed miesiąca jest świeży', () => {
        expect(isStale('2026-07-01', TODAY)).toBe(false)
    })

    it('dokładnie 6 miesięcy temu jeszcze nie jest przeterminowany', () => {
        expect(isStale('2026-02-03', TODAY)).toBe(false)
    })

    it('dzień po progu 6 miesięcy jest przeterminowany', () => {
        expect(isStale('2026-02-02', TODAY)).toBe(true)
    })

    it('własny próg miesięcy jest respektowany', () => {
        expect(isStale('2026-06-01', TODAY, 1)).toBe(true)
        expect(isStale('2026-07-10', TODAY, 1)).toBe(false)
    })
})

describe('isFresh (okno 90 dni dla KPI)', () => {
    it('brak wpisu nie jest świeży', () => {
        expect(isFresh(null, TODAY)).toBe(false)
    })

    it('wpis sprzed 89 dni jest świeży, sprzed 90 już nie', () => {
        expect(isFresh('2026-05-06', TODAY)).toBe(true) // 89 dni
        expect(isFresh('2026-05-05', TODAY)).toBe(false) // 90 dni
    })

    it('wpis z przyszłości (błąd danych) traktowany jako świeży, nie wybucha', () => {
        expect(isFresh('2026-09-01', TODAY)).toBe(true)
    })
})
