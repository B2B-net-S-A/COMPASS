import { describe, it, expect } from 'vitest'
import {
    dailyDigestWindowStart,
    digestWindowStart,
    isDigestDay,
    selectOverdueFollowUps,
    selectRedAlerts,
    shouldSendDailyDigest,
    sourceFailureStreaks,
    sourcesCrossingFailureThreshold,
    SOURCE_FAILURE_STREAK_THRESHOLD,
} from '../alert-selection'

const item = (over: Partial<Parameters<typeof selectRedAlerts>[0][number]> = {}) => ({
    id: 'i1',
    severity: 'red',
    status: 'new',
    alerted_at: null,
    ...over,
})

const run = (sources: Record<string, string>) => ({ sources_checked: sources })

describe('selectRedAlerts', () => {
    it('bierze czerwone, nieprzejrzane, jeszcze niezaalertowane', () => {
        expect(selectRedAlerts([item()]).map((i) => i.id)).toEqual(['i1'])
    })

    it('pomija żółte i zielone', () => {
        expect(selectRedAlerts([item({ severity: 'yellow' }), item({ severity: 'green' })])).toEqual([])
    })

    it('pomija już zaalertowane', () => {
        expect(selectRedAlerts([item({ alerted_at: '2026-08-10T06:00:00Z' })])).toEqual([])
    })

    it('pomija wpisy tknięte przez człowieka — alert jest bezprzedmiotowy', () => {
        expect(selectRedAlerts([item({ status: 'action_required' })])).toEqual([])
        expect(selectRedAlerts([item({ status: 'dismissed' })])).toEqual([])
    })
})

describe('sourceFailureStreaks', () => {
    it('liczy serię od najnowszego przebiegu', () => {
        const streaks = sourceFailureStreaks([
            run({ SEJM_RCL: 'fail', GIP: 'ok' }),
            run({ SEJM_RCL: 'fail', GIP: 'empty' }),
            run({ SEJM_RCL: 'ok', GIP: 'ok' }),
        ])
        expect(streaks.SEJM_RCL).toBe(2)
        expect(streaks.GIP).toBeUndefined()
    })

    it('urywa serię na pierwszym udanym przebiegu, nie licząc starszych awarii', () => {
        const streaks = sourceFailureStreaks([
            run({ ZUS: 'fail' }),
            run({ ZUS: 'ok' }),
            run({ ZUS: 'fail' }),
            run({ ZUS: 'fail' }),
        ])
        expect(streaks.ZUS).toBe(1)
    })

    it('brak klucza w przebiegu nie przerywa ani nie wydłuża serii', () => {
        const streaks = sourceFailureStreaks([
            run({ TK: 'fail' }),
            run({ GIP: 'ok' }), // TK w ogóle nieobecne
            run({ TK: 'fail' }),
        ])
        expect(streaks.TK).toBe(2)
    })

    it('luka w środku serii jej nie zeruje (regresja: zarzut z review #327)', () => {
        // [fail, fail, brak klucza, fail] → 3, a nie 2: przebieg bez wpisu o źródle
        // nie jest dowodem, że źródło odżyło, więc nie przerywa serii.
        const streaks = sourceFailureStreaks([
            run({ SEJM_RCL: 'fail' }),
            run({ SEJM_RCL: 'fail' }),
            run({ GIP: 'ok' }),
            run({ SEJM_RCL: 'fail' }),
        ])
        expect(streaks.SEJM_RCL).toBe(3)
    })

    it('znosi pusty log i puste sources_checked', () => {
        expect(sourceFailureStreaks([])).toEqual({})
        expect(sourceFailureStreaks([run({})])).toEqual({})
    })
})

describe('sourcesCrossingFailureThreshold', () => {
    it('alertuje dokładnie na progu', () => {
        const runs = Array.from({ length: SOURCE_FAILURE_STREAK_THRESHOLD }, () =>
            run({ SEJM_RCL: 'fail' }),
        )
        expect(sourcesCrossingFailureThreshold(runs)).toEqual(['SEJM_RCL'])
    })

    it('nie powtarza alertu po przekroczeniu progu', () => {
        const runs = Array.from({ length: SOURCE_FAILURE_STREAK_THRESHOLD + 2 }, () =>
            run({ SEJM_RCL: 'fail' }),
        )
        expect(sourcesCrossingFailureThreshold(runs)).toEqual([])
    })

    it('milczy przy pojedynczej awarii — to rutyna, nie zdarzenie', () => {
        expect(sourcesCrossingFailureThreshold([run({ SEJM_RCL: 'fail' }), run({ SEJM_RCL: 'ok' })]))
            .toEqual([])
    })

    it('zgłasza wiele źródeł naraz, alfabetycznie', () => {
        const runs = Array.from({ length: 3 }, () => run({ ZUS: 'fail', GIP: 'fail' }))
        expect(sourcesCrossingFailureThreshold(runs, 3)).toEqual(['GIP', 'ZUS'])
    })
})

describe('selectOverdueFollowUps', () => {
    const now = new Date('2026-08-10T09:00:00Z') // 11:00 w Warszawie
    const base = {
        id: 'a',
        status: 'action_required',
        due_date: '2026-08-09',
        reminded_at: null,
        assigned_to: null,
    }

    it('bierze przeterminowane „do reakcji"', () => {
        expect(selectOverdueFollowUps([base], now).map((i) => i.id)).toEqual(['a'])
    })

    it('termin dzisiejszy też jest wymagalny', () => {
        expect(selectOverdueFollowUps([{ ...base, due_date: '2026-08-10' }], now)).toHaveLength(1)
    })

    it('pomija terminy w przyszłości', () => {
        expect(selectOverdueFollowUps([{ ...base, due_date: '2026-08-11' }], now)).toEqual([])
    })

    it('pomija wpisy bez terminu i o innym statusie', () => {
        expect(selectOverdueFollowUps([{ ...base, due_date: null }], now)).toEqual([])
        expect(selectOverdueFollowUps([{ ...base, status: 'reviewed' }], now)).toEqual([])
    })

    it('nie przypomina dwa razy tego samego dnia', () => {
        const remindedToday = { ...base, reminded_at: '2026-08-10T05:00:00Z' }
        expect(selectOverdueFollowUps([remindedToday], now)).toEqual([])
    })

    it('przypomina ponownie następnego dnia', () => {
        const remindedYesterday = { ...base, reminded_at: '2026-08-09T05:00:00Z' }
        expect(selectOverdueFollowUps([remindedYesterday], now)).toHaveLength(1)
    })
})

describe('isDigestDay / digestWindowStart', () => {
    it('digest tylko w poniedziałek czasu warszawskiego', () => {
        expect(isDigestDay(new Date('2026-08-10T09:00:00Z'))).toBe(true) // poniedziałek
        expect(isDigestDay(new Date('2026-08-11T09:00:00Z'))).toBe(false) // wtorek
        expect(isDigestDay(new Date('2026-08-09T09:00:00Z'))).toBe(false) // niedziela
    })

    it('niedziela 23:30 UTC to już poniedziałek w Warszawie', () => {
        expect(isDigestDay(new Date('2026-08-09T23:30:00Z'))).toBe(true)
    })

    it('okno digestu to tydzień wstecz', () => {
        expect(digestWindowStart(new Date('2026-08-10T09:00:00Z'))).toBe('2026-08-03')
    })
})

describe('shouldSendDailyDigest / dailyDigestWindowStart', () => {
    it('bez stempla wysyła, okno cofa się o dobę', () => {
        const now = new Date('2026-08-24T08:00:00Z')
        expect(shouldSendDailyDigest(null, now)).toBe(true)
        expect(dailyDigestWindowStart(null, now)).toBe('2026-08-23T08:00:00.000Z')
    })

    it('nie dubluje wysyłki tego samego dnia warszawskiego', () => {
        expect(shouldSendDailyDigest('2026-08-24T06:05:00Z', new Date('2026-08-24T11:00:00Z'))).toBe(false)
    })

    it('następnego dnia wysyła, a okno zaczyna się dokładnie na stemplu', () => {
        const now = new Date('2026-08-25T08:00:00Z')
        expect(shouldSendDailyDigest('2026-08-24T08:00:00Z', now)).toBe(true)
        expect(dailyDigestWindowStart('2026-08-24T08:00:00Z', now)).toBe('2026-08-24T08:00:00Z')
    })

    it('granica doby liczona w Warszawie: 23:30 UTC to już następny dzień', () => {
        // stempel 24.08 21:00 UTC = 23:00 w Warszawie; now 24.08 23:30 UTC = 25.08 01:30 w Warszawie
        expect(shouldSendDailyDigest('2026-08-24T21:00:00Z', new Date('2026-08-24T23:30:00Z'))).toBe(true)
    })

    it('zepsuty stempel traktuje jak brak stempla — wysyła zamiast zamilknąć', () => {
        const now = new Date('2026-08-24T08:00:00Z')
        expect(shouldSendDailyDigest('nie-data', now)).toBe(true)
        expect(dailyDigestWindowStart('nie-data', now)).toBe('2026-08-23T08:00:00.000Z')
    })
})
