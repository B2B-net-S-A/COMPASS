import { describe, it, expect } from 'vitest'
import {
    closedMonthFor,
    isWithinReminderWindow,
    periodLabel,
    periodStartIso,
    submissionDeadlineIso,
    TIMESHEET_DEADLINE_DAY,
} from '../timesheet-reminder-window'

describe('closedMonthFor', () => {
    it('wskazuje miesiąc poprzedni, nie bieżący', () => {
        // Regresja Phase 52: stary cron przypominał o timesheecie za miesiąc, który
        // jeszcze trwał (12.08 mail „za sierpień, termin za 3 dni").
        expect(closedMonthFor('2026-09-01')).toEqual({ year: 2026, month: 8 })
        expect(closedMonthFor('2026-09-05')).toEqual({ year: 2026, month: 8 })
    })

    it('przechodzi przez granicę roku', () => {
        expect(closedMonthFor('2026-01-03')).toEqual({ year: 2025, month: 12 })
    })
})

describe('isWithinReminderWindow', () => {
    it('obejmuje 1.–5. dzień miesiąca', () => {
        expect(isWithinReminderWindow('2026-09-01')).toBe(true)
        expect(isWithinReminderWindow('2026-09-05')).toBe(true)
    })

    it('odrzuca dzień po terminie', () => {
        expect(isWithinReminderWindow('2026-09-06')).toBe(false)
    })

    it('odrzuca dni, w których strzelał stary cron (każdy pon./śr. miesiąca)', () => {
        expect(isWithinReminderWindow('2026-08-12')).toBe(false) // środa z maila Artura
        expect(isWithinReminderWindow('2026-08-17')).toBe(false) // poniedziałek
        expect(isWithinReminderWindow('2026-08-25')).toBe(false) // stary cron GH Actions
    })
})

describe('submissionDeadlineIso', () => {
    it('to 5. dzień kolejnego miesiąca', () => {
        expect(submissionDeadlineIso({ year: 2026, month: 8 })).toBe('2026-09-05')
    })

    it('przechodzi przez granicę roku', () => {
        expect(submissionDeadlineIso({ year: 2026, month: 12 })).toBe('2027-01-05')
    })

    it('dzień terminu zgadza się ze stałą', () => {
        expect(submissionDeadlineIso({ year: 2026, month: 2 })).toBe(
            `2026-03-0${TIMESHEET_DEADLINE_DAY}`,
        )
    })
})

describe('etykiety okresu', () => {
    it('period label i period start są zero-paddowane', () => {
        expect(periodLabel({ year: 2026, month: 1 })).toBe('2026-01')
        expect(periodStartIso({ year: 2026, month: 1 })).toBe('2026-01-01')
    })
})

describe('spójność okna z terminem', () => {
    it('każdy dzień okna wskazuje ten sam zamknięty miesiąc i ten sam termin', () => {
        // Pięć prób (cron chodzi codziennie 1.–5.) musi celować w ten sam okres —
        // inaczej dedup po (user, rok, miesiąc) nie chroniłby przed drugim mailem.
        const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
        const periods = days.map(closedMonthFor)
        expect(new Set(periods.map(periodLabel)).size).toBe(1)
        expect(new Set(periods.map(submissionDeadlineIso))).toEqual(new Set(['2026-09-05']))
    })

    it('termin wypada ostatniego dnia okna', () => {
        const period = closedMonthFor('2026-09-01')
        const deadline = submissionDeadlineIso(period)
        expect(isWithinReminderWindow(deadline)).toBe(true)
    })
})

describe('walidacja wejścia', () => {
    it('rzuca na dacie w złym formacie zamiast cicho liczyć zły miesiąc', () => {
        expect(() => closedMonthFor('12.08.2026')).toThrow(/Nieprawidłowa data/)
        expect(() => isWithinReminderWindow('')).toThrow(/Nieprawidłowa data/)
    })
})
