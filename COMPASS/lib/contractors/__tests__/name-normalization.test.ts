import { describe, expect, it } from 'vitest'
import {
    CLIENT_ALIASES,
    normalizeClientName,
    normalizeStaffName,
    STAFF_ALIASES,
} from '../name-normalization'

describe('normalizeClientName', () => {
    it('scala warianty wielkości liter do jednej pisowni', () => {
        for (const variant of ['Nordea', 'NORDEA', 'nordea', '  NoRdEa  ']) {
            expect(normalizeClientName(variant)).toBe('Nordea')
        }
    })

    it('trzyma się pisowni ze słownika `clients` (Phase 27d)', () => {
        // Wersaliki nie są kaprysem — dropdown premii pokazuje dokładnie te formy.
        expect(normalizeClientName('Atos')).toBe('ATOS')
        expect(normalizeClientName('Bosch')).toBe('BOSCH')
        expect(normalizeClientName('Ergo')).toBe('ERGO')
        expect(normalizeClientName('Orlen')).toBe('ORLEN')
        expect(normalizeClientName('Nori')).toBe('NORI')
    })

    it('poprawia literówkę Xperii', () => {
        expect(normalizeClientName('Xperii')).toBe('XPERI')
        expect(normalizeClientName('Xperi')).toBe('XPERI')
    })

    it('rozwija skróty do pełnych nazw', () => {
        expect(normalizeClientName('BNP')).toBe('BNP Paribas')
        expect(normalizeClientName('PKO')).toBe('PKO BP')
        expect(normalizeClientName('ALIOR BANK')).toBe('Alior')
        expect(normalizeClientName('Nationale')).toBe('Nationale Nederlanden')
        expect(normalizeClientName('VELO')).toBe('VeloBank')
    })

    it('ujednolica zapis z myślnikiem i bez', () => {
        for (const variant of ['EZDROWIE', 'eZdrowie', 'ezdrowie', 'E-zdrowie', 'e-zdrowie']) {
            expect(normalizeClientName(variant)).toBe('e-zdrowie')
        }
        expect(normalizeClientName('mleasing')).toBe('mLeasing')
        expect(normalizeClientName('m-leasing')).toBe('mLeasing')
    })

    it('scala warianty spółki ubezpieczeniowej, ale nie miesza jej z bankiem', () => {
        for (const variant of ['Cardif', 'BNP Cardif', 'BNP Paribas Cardif', 'CARDIF']) {
            expect(normalizeClientName(variant)).toBe('BNP Paribas Cardif')
        }
        expect(normalizeClientName('BNP')).toBe('BNP Paribas') // bank zostaje bankiem
    })

    it('poprawia stylizację marki MetLife', () => {
        expect(normalizeClientName('Metlife')).toBe('MetLife')
        expect(normalizeClientName('METLIFE')).toBe('MetLife')
    })

    it('NIE scala osobnych bytów biznesowych', () => {
        expect(normalizeClientName('Centrum e-Zdrowia')).toBe('Centrum e-Zdrowia')
        expect(normalizeClientName('BOSCH/Nordea')).toBe('BOSCH/Nordea')
        expect(normalizeClientName('Frontex / Atos')).toBe('Frontex / Atos')
    })

    it('znosi null/undefined bez wyjątku', () => {
        expect(normalizeClientName(null)).toBe('')
        expect(normalizeClientName(undefined)).toBe('')
    })

    it('nieznane nazwy zostawia z oryginalną pisownią, tylko przycięte', () => {
        expect(normalizeClientName('  Bank   Pocztowy ')).toBe('Bank Pocztowy')
        expect(normalizeClientName('PFRON')).toBe('PFRON')
        expect(normalizeClientName('Ministerstwo Sprawiedliwości')).toBe('Ministerstwo Sprawiedliwości')
    })

    it('jest idempotentna — kanoniczna nazwa przechodzi przez siebie bez zmian', () => {
        for (const canonical of Object.values(CLIENT_ALIASES)) {
            expect(normalizeClientName(canonical)).toBe(canonical)
        }
    })
})

describe('normalizeStaffName', () => {
    it('poprawia literówki w nazwiskach', () => {
        expect(normalizeStaffName('Aleksandra Borzecka')).toBe('Aleksandra Borzęcka')
        expect(normalizeStaffName('Aleskandra Borzęcka')).toBe('Aleksandra Borzęcka')
        expect(normalizeStaffName('Anna Makushenko')).toBe('Anna Makushchenko')
        expect(normalizeStaffName('lza Grabińska')).toBe('Elza Grabińska')
        expect(normalizeStaffName('Michał Lenczewsk')).toBe('Michał Lenczewski')
        expect(normalizeStaffName('MIchał Walasek')).toBe('Michał Walasek')
        expect(normalizeStaffName('Kristsina Soiko')).toBe('Krystyna Sojko')
        expect(normalizeStaffName('Krystyna Soiko')).toBe('Krystyna Sojko')
    })

    it('scala zdrobnienie, dopisek kadencji i jednoznaczne imię', () => {
        expect(normalizeStaffName('Ola Królewicz')).toBe('Aleksandra Królewicz')
        expect(normalizeStaffName('Igor')).toBe('Igor Twardowski')
        expect(normalizeStaffName('Igor Twardowski / Stara Kadencja')).toBe('Igor Twardowski')
        expect(normalizeStaffName('Błażej')).toBe('Błażej Bęben') // TCM w logu rozmów
    })

    it('NIE zgaduje przy imionach o wielu właścicielach', () => {
        expect(normalizeStaffName('Klaudia')).toBe('Klaudia')
        expect(normalizeStaffName('Marcin')).toBe('Marcin')
        expect(normalizeStaffName('Olaf')).toBe('Olaf')
        expect(normalizeStaffName('Paula')).toBe('Paula')
        expect(normalizeStaffName('Dominik/Malwina')).toBe('Dominik/Malwina')
    })

    it('znaczniki „brak" dają null zamiast fałszywej osoby w statystykach', () => {
        for (const marker of [null, undefined, '', '   ', '-', '--', '—', '–', 'ND', 'nd', 'nd.', 'brak', 'n/a', 'x', 'X']) {
            expect(normalizeStaffName(marker), `marker ${JSON.stringify(marker)}`).toBeNull()
        }
    })

    it('nieznane nazwiska zostawia nietknięte poza przycięciem', () => {
        expect(normalizeStaffName('  Damian   Wąsik ')).toBe('Damian Wąsik')
        expect(normalizeStaffName('Malwina Jobda')).toBe('Malwina Jobda')
    })

    it('jest idempotentna — kanoniczne nazwisko przechodzi przez siebie bez zmian', () => {
        for (const canonical of Object.values(STAFF_ALIASES)) {
            expect(normalizeStaffName(canonical)).toBe(canonical)
        }
    })
})
