import { describe, expect, it } from 'vitest'
import { anonymizeProjectText, formatProjectValue, SENSITIVE_CLIENTS } from '../anonymizer'

describe('SENSITIVE_CLIENTS', () => {
    it('contains the major Polish banks the business asked us to anonymize', () => {
        expect(SENSITIVE_CLIENTS).toEqual(expect.arrayContaining([
            'Nordea', 'BNP', 'Paribas', 'BIK', 'PKO', 'Pekao', 'Santander',
            'ING', 'mBank', 'Millennium', 'Alior', 'Citi', 'Handlowy',
        ]))
    })
})

describe('anonymizeProjectText', () => {
    it('returns empty string for null/undefined/empty input', () => {
        expect(anonymizeProjectText(null)).toBe('')
        expect(anonymizeProjectText(undefined)).toBe('')
        expect(anonymizeProjectText('')).toBe('')
    })

    it('replaces a single sensitive client with "Klient"', () => {
        expect(anonymizeProjectText('Projekt dla Nordea Bank')).toBe('Projekt dla Klient Bank')
    })

    it('replaces multiple sensitive clients in the same text', () => {
        const input = 'Migracja z PKO do Santander dla klienta ING'
        expect(anonymizeProjectText(input)).toBe('Migracja z Klient do Klient dla klienta Klient')
    })

    it('is case-insensitive', () => {
        expect(anonymizeProjectText('NORDEA, nordea, NoRdEa')).toBe('Klient, Klient, Klient')
    })

    it('respects word boundaries (does not match substrings inside words)', () => {
        expect(anonymizeProjectText('subingredient PKOwsk')).toBe('subingredient PKOwsk')
        expect(anonymizeProjectText('We deployed for ING.')).toBe('We deployed for Klient.')
    })

    it('preserves surrounding whitespace and punctuation', () => {
        expect(anonymizeProjectText('  Nordea, BNP. ')).toBe('  Klient, Klient. ')
    })

    it('does not touch unrelated client names', () => {
        expect(anonymizeProjectText('Projekt dla Allegro i CD Projekt')).toBe('Projekt dla Allegro i CD Projekt')
    })

    it('is idempotent — calling twice produces same result', () => {
        const once = anonymizeProjectText('PKO + Pekao')
        const twice = anonymizeProjectText(once)
        expect(twice).toBe(once)
    })
})

describe('formatProjectValue', () => {
    it('returns "Brak" for admin and "N/A" for non-admin when value is missing', () => {
        expect(formatProjectValue(null, true)).toBe('Brak')
        expect(formatProjectValue(null, false)).toBe('N/A')
        expect(formatProjectValue(undefined, true)).toBe('Brak')
        expect(formatProjectValue('', false)).toBe('N/A')
    })

    it('treats common placeholder strings as missing', () => {
        for (const ph of ['brak', 'BRAK', 'nie podano', 'TBD', 'nieznana', 'NaN', 'null', 'undefined', '-']) {
            expect(formatProjectValue(ph, true)).toBe('Brak')
            expect(formatProjectValue(ph, false)).toBe('N/A')
        }
    })

    it('returns the string value as-is for real content', () => {
        expect(formatProjectValue('Senior Developer', true)).toBe('Senior Developer')
        expect(formatProjectValue('Senior Developer', false)).toBe('Senior Developer')
    })

    it('coerces numbers to strings', () => {
        expect(formatProjectValue(123, true)).toBe('123')
    })

    it('trims surrounding whitespace', () => {
        expect(formatProjectValue('  Senior Dev  ', false)).toBe('Senior Dev')
    })
})
