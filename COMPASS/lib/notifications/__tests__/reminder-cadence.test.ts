import { describe, it, expect } from 'vitest'
import {
    isWeeklyReminderDay,
    isWithinReminderWindow,
    pickDueRecipients,
    shiftIsoDate,
    warsawToday,
} from '../reminder-cadence'

const NOW = new Date('2026-08-25T09:00:00Z') // poniedziałek

describe('pickDueRecipients', () => {
    it('wpuszcza odbiorcę, który nigdy nie dostał przypomnienia', () => {
        expect(pickDueRecipients(['a'], new Map(), NOW)).toEqual(['a'])
    })

    it('blokuje odbiorcę z przypomnieniem sprzed 2 dni (kadencja 7 dni)', () => {
        const last = new Map([['a', '2026-08-23T09:00:00Z']])
        expect(pickDueRecipients(['a'], last, NOW)).toEqual([])
    })

    it('wpuszcza odbiorcę z przypomnieniem sprzed 8 dni', () => {
        const last = new Map([['a', '2026-08-17T08:00:00Z']])
        expect(pickDueRecipients(['a'], last, NOW)).toEqual(['a'])
    })

    it('honoruje własną kadencję', () => {
        const last = new Map([['a', '2026-08-23T09:00:00Z']])
        expect(pickDueRecipients(['a'], last, NOW, 1)).toEqual(['a'])
    })

    it('deduplikuje powtórzonych kandydatów i pomija puste id', () => {
        expect(pickDueRecipients(['a', 'a', '', 'b'], new Map(), NOW)).toEqual(['a', 'b'])
    })

    it('traktuje nieparsowalny stempel jak jego brak — lepiej wysłać niż zamilknąć', () => {
        const last = new Map([['a', 'nie-data']])
        expect(pickDueRecipients(['a'], last, NOW)).toEqual(['a'])
    })
})

describe('isWeeklyReminderDay', () => {
    it('poniedziałek = tak', () => {
        expect(isWeeklyReminderDay(new Date('2026-08-24T10:00:00Z'))).toBe(true)
    })

    it('wtorek = nie', () => {
        expect(isWeeklyReminderDay(new Date('2026-08-25T10:00:00Z'))).toBe(false)
    })

    it('niedziela 23:30 UTC to już poniedziałek w Warszawie', () => {
        expect(isWeeklyReminderDay(new Date('2026-08-23T23:30:00Z'))).toBe(true)
    })
})

describe('isWithinReminderWindow', () => {
    const win = { daysBefore: 3, daysAfter: 14 }

    it('termin za 2 dni mieści się w oknie', () => {
        expect(isWithinReminderWindow('2026-08-27', '2026-08-25', win)).toBe(true)
    })

    it('termin za 5 dni jest jeszcze za wcześnie', () => {
        expect(isWithinReminderWindow('2026-08-30', '2026-08-25', win)).toBe(false)
    })

    it('termin sprzed 10 dni nadal przypomina', () => {
        expect(isWithinReminderWindow('2026-08-15', '2026-08-25', win)).toBe(true)
    })

    it('termin sprzed kwartału już nie — to był ten nieskończony mail', () => {
        expect(isWithinReminderWindow('2026-05-19', '2026-08-25', win)).toBe(false)
    })

    it('brak terminu = poza oknem', () => {
        expect(isWithinReminderWindow(null, '2026-08-25', win)).toBe(false)
    })
})

describe('shiftIsoDate', () => {
    it('przesuwa przez granicę miesiąca', () => {
        expect(shiftIsoDate('2026-08-01', -1)).toBe('2026-07-31')
        expect(shiftIsoDate('2026-08-31', 1)).toBe('2026-09-01')
    })

    it('zwraca wejście bez zmian, gdy nie jest datą', () => {
        expect(shiftIsoDate('brak', 5)).toBe('brak')
    })
})

describe('warsawToday', () => {
    it('liczy dzień w strefie warszawskiej, nie UTC', () => {
        // 22:30 UTC = 00:30 następnego dnia w Warszawie (czas letni).
        expect(warsawToday(new Date('2026-08-24T22:30:00Z'))).toBe('2026-08-25')
    })
})
