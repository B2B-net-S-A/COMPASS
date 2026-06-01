import { describe, it, expect } from 'vitest'
import {
    normalizeConversationCategory,
    normalizeWhoResigned,
    conversationStatusFromFill,
    importExternalKey,
} from '@/lib/types/contractor'

describe('normalizeConversationCategory (Sprawa → enum)', () => {
    it.each([
        ['Szkolenia', 'szkolenia'],
        ['Podwyżka', 'podwyzka'],
        ['Podwyżka ', 'podwyzka'],
        ['Follow-up', 'follow_up'],
        ['Zejście', 'zejscie'],
        ['Wypowiedzenie', 'zejscie'],
        ['Przedłużenie', 'przedluzenie'],
        ['Informacyjnie', 'informacyjnie'],
        ['inf.', 'informacyjnie'],
        ['Konferencja', 'konferencja'],
        ['Onboarding interview', 'onboarding'],
        ['Onboarding', 'onboarding'],
        ['Exit interview', 'exit'],
        ['Exit od Nordea', 'exit'],
        ['Delegacja', 'delegacja'],
        ['Internalizacja', 'internalizacja'],
        ['Zmiana stawki', 'zmiana_stawki'],
        ['Obniżka', 'zmiana_stawki'],
        ['jakiś cyrk', 'inne'],
        ['', 'inne'],
        [null, 'inne'],
    ])('maps %s → %s', (input, expected) => {
        expect(normalizeConversationCategory(input as string | null)).toBe(expected)
    })
})

describe('normalizeWhoResigned (Kto zrezygnował → enum)', () => {
    it.each([
        ['Klient', 'klient'],
        ['Kandydat', 'kandydat'],
        ['Koniec zamówienia', 'koniec_zamowienia'],
        ['Internalizacja', 'internalizacja'],
        ['Kandydat/Klient', 'kandydat_klient'],
        ['?', 'nieznany'],
        ['', 'nieznany'],
        [null, 'nieznany'],
    ])('maps %s → %s', (input, expected) => {
        expect(normalizeWhoResigned(input as string | null)).toBe(expected)
    })
})

describe('conversationStatusFromFill (Excel colour → status)', () => {
    it('maps red → pilne', () => {
        expect(conversationStatusFromFill('FFFF0000')).toBe('pilne')
        expect(conversationStatusFromFill('FFC00000')).toBe('pilne')
    })
    it('maps green → rozwiazane', () => {
        expect(conversationStatusFromFill('FF00B050')).toBe('rozwiazane')
        expect(conversationStatusFromFill('FF92D050')).toBe('rozwiazane')
    })
    it('maps blue → potrzebny_kontakt', () => {
        expect(conversationStatusFromFill('FF00B0F0')).toBe('potrzebny_kontakt')
        expect(conversationStatusFromFill('FF0070C0')).toBe('potrzebny_kontakt')
    })
    it('maps yellow → w_toku', () => {
        expect(conversationStatusFromFill('FFFFFF00')).toBe('w_toku')
        expect(conversationStatusFromFill('FFFFC000')).toBe('w_toku')
    })
    it('returns null for white / empty / black', () => {
        expect(conversationStatusFromFill('FFFFFFFF')).toBeNull()
        expect(conversationStatusFromFill(null)).toBeNull()
        expect(conversationStatusFromFill('')).toBeNull()
        expect(conversationStatusFromFill('FF000000')).toBeNull()
    })
})

describe('importExternalKey', () => {
    it('is deterministic for the same inputs', () => {
        expect(importExternalKey('conv', 'Jan Kowalski', '2024-01-01', 'note')).toBe(
            importExternalKey('conv', 'Jan Kowalski', '2024-01-01', 'note'),
        )
    })
    it('is case/whitespace-insensitive', () => {
        expect(importExternalKey('conv', '  Jan Kowalski ', '2024-01-01')).toBe(
            importExternalKey('conv', 'jan kowalski', '2024-01-01'),
        )
    })
    it('differs for different inputs', () => {
        expect(importExternalKey('conv', 'Jan Kowalski', '2024-01-01')).not.toBe(
            importExternalKey('conv', 'Jan Kowalski', '2024-01-02'),
        )
    })
})
