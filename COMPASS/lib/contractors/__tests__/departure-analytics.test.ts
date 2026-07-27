import { describe, expect, it } from 'vitest'
import {
    buildDepartureAnalytics,
    buildMonthlyDepartureSeries,
    collectFilterOptions,
    filterDepartures,
    NO_RECRUITER_LABEL,
    recruiterLabel,
    resolvePeriodRange,
    summarizeDepartures,
    type DepartureAnalyticsRow,
} from '../departure-analytics'

const dep = (over: Partial<DepartureAnalyticsRow> = {}): DepartureAnalyticsRow => ({
    departure_date: '2026-06-30',
    who_resigned: 'klient',
    client_name: 'ACME',
    recruiter_raw: 'Anna Rekruter',
    ...over,
})

// Środek miesiąca, żeby złapać błędy typu "zakres startuje od dziś, nie od 1."
const NOW = new Date('2026-07-15T10:00:00Z')

describe('resolvePeriodRange', () => {
    it('month = pełny bieżący miesiąc, górna granica wyłączna', () => {
        expect(resolvePeriodRange('month', NOW)).toEqual({ from: '2026-07-01', to: '2026-08-01' })
    })

    it('quarter = kwartał kalendarzowy zawierający dziś', () => {
        expect(resolvePeriodRange('quarter', NOW)).toEqual({ from: '2026-07-01', to: '2026-10-01' })
    })

    it('quarter Q4 przechodzi na kolejny rok', () => {
        expect(resolvePeriodRange('quarter', new Date('2026-11-02T00:00:00Z'))).toEqual({
            from: '2026-10-01',
            to: '2027-01-01',
        })
    })

    it('year = rok kalendarzowy', () => {
        expect(resolvePeriodRange('year', NOW)).toEqual({ from: '2026-01-01', to: '2027-01-01' })
    })

    it('last12 = bieżący miesiąc + 11 poprzednich (przełom roku)', () => {
        expect(resolvePeriodRange('last12', new Date('2026-02-10T00:00:00Z'))).toEqual({
            from: '2025-03-01',
            to: '2026-03-01',
        })
    })

    it('all = brak ograniczenia', () => {
        expect(resolvePeriodRange('all', NOW)).toBeNull()
    })
})

describe('filterDepartures', () => {
    const rows = [
        dep({ departure_date: '2026-06-30' }),
        dep({ departure_date: '2026-07-01', client_name: 'Nordea' }),
        dep({ departure_date: '2026-07-31', client_name: 'Nordea', recruiter_raw: '  ' }),
        dep({ departure_date: '2026-08-01' }),
        dep({ departure_date: null }),
    ]

    it('zakres jest półotwarty — pierwszy dzień wchodzi, ostatni (to) już nie', () => {
        const out = filterDepartures(rows, { range: { from: '2026-07-01', to: '2026-08-01' } })
        expect(out.map((r) => r.departure_date)).toEqual(['2026-07-01', '2026-07-31'])
    })

    it('wiersze bez daty wypadają przy zakresie, ale zostają przy braku zakresu', () => {
        expect(filterDepartures(rows, { range: { from: '2020-01-01', to: '2030-01-01' } })).toHaveLength(4)
        expect(filterDepartures(rows, { range: null })).toHaveLength(5)
        expect(filterDepartures(rows)).toHaveLength(5)
    })

    it('filtruje po kliencie i po rekruterze (pusty rekruter przez etykietę kubła)', () => {
        expect(filterDepartures(rows, { client: 'Nordea' })).toHaveLength(2)
        expect(filterDepartures(rows, { recruiter: NO_RECRUITER_LABEL })).toHaveLength(1)
        expect(filterDepartures(rows, { client: 'Nordea', recruiter: 'Anna Rekruter' })).toHaveLength(1)
    })
})

describe('buildMonthlyDepartureSeries', () => {
    it('zwraca ciągłą oś 12 miesięcy rosnąco, kończąc na bieżącym', () => {
        const series = buildMonthlyDepartureSeries([], 12, NOW)
        expect(series).toHaveLength(12)
        expect(series[0].period).toBe('2025-08')
        expect(series[11].period).toBe('2026-07')
    })

    it('miesiąc bez zejść ma same zera zamiast dziury', () => {
        const series = buildMonthlyDepartureSeries([dep({ departure_date: '2026-07-02' })], 12, NOW)
        const may = series.find((b) => b.period === '2026-05')
        expect(may).toMatchObject({ total: 0, klient: 0, nieznany: 0 })
    })

    it('rozbija miesiąc na kategorie i sumuje total', () => {
        const series = buildMonthlyDepartureSeries(
            [
                dep({ departure_date: '2026-06-01', who_resigned: 'klient' }),
                dep({ departure_date: '2026-06-15', who_resigned: 'klient' }),
                dep({ departure_date: '2026-06-30', who_resigned: 'internalizacja' }),
                dep({ departure_date: '2026-06-30', who_resigned: null }),
            ],
            12,
            NOW,
        )
        const june = series.find((b) => b.period === '2026-06')
        expect(june).toMatchObject({ klient: 2, internalizacja: 1, nieznany: 1, total: 4 })
    })

    it('pomija wiersze bez daty i spoza okna serii', () => {
        const series = buildMonthlyDepartureSeries(
            [dep({ departure_date: null }), dep({ departure_date: '2021-12-31' })],
            12,
            NOW,
        )
        expect(series.reduce((sum, b) => sum + b.total, 0)).toBe(0)
    })
})

describe('summarizeDepartures', () => {
    const rows = [
        dep({ who_resigned: 'klient', client_name: 'ACME', recruiter_raw: 'Anna' }),
        dep({ who_resigned: 'klient', client_name: 'Nordea', recruiter_raw: 'Anna' }),
        dep({ who_resigned: 'kandydat', client_name: 'ACME', recruiter_raw: null }),
        dep({ who_resigned: null, client_name: 'ACME', recruiter_raw: '', departure_date: null }),
    ]

    it('liczy total, braki dat i kategorie malejąco', () => {
        const s = summarizeDepartures(rows)
        expect(s.total).toBe(4)
        expect(s.withoutDate).toBe(1)
        expect(s.byWho).toEqual([
            { who: 'klient', count: 2 },
            { who: 'kandydat', count: 1 },
            { who: 'nieznany', count: 1 },
        ])
    })

    it('grupuje per klient i per rekruter, puste pole wpada do kubła', () => {
        const s = summarizeDepartures(rows)
        expect(s.byClient[0]).toEqual({ label: 'ACME', count: 3 })
        expect(s.byRecruiter).toContainEqual({ label: 'Anna', count: 2 })
        expect(s.byRecruiter).toContainEqual({ label: NO_RECRUITER_LABEL, count: 2 })
    })

    it('przycina listy do topN', () => {
        const many = Array.from({ length: 20 }, (_, i) => dep({ client_name: `Klient ${i}` }))
        expect(summarizeDepartures(many, 15).byClient).toHaveLength(15)
    })
})

describe('collectFilterOptions', () => {
    it('unikalne, posortowane po polsku, z kubłem rekrutera na końcu', () => {
        const { clients, recruiters } = collectFilterOptions([
            dep({ client_name: 'Żabka', recruiter_raw: 'Zenon' }),
            dep({ client_name: 'ACME', recruiter_raw: null }),
            dep({ client_name: 'ACME', recruiter_raw: 'Ada' }),
        ])
        expect(clients).toEqual(['ACME', 'Żabka'])
        expect(recruiters).toEqual(['Ada', 'Zenon', NO_RECRUITER_LABEL])
    })
})

describe('buildDepartureAnalytics', () => {
    const rows = [
        dep({ departure_date: '2026-07-10', who_resigned: 'klient', client_name: 'ACME', recruiter_raw: 'Anna' }),
        dep({ departure_date: '2026-05-10', who_resigned: 'kandydat', client_name: 'ACME', recruiter_raw: 'Anna' }),
        dep({ departure_date: '2025-09-10', who_resigned: 'klient', client_name: 'Nordea', recruiter_raw: 'Bartek' }),
        dep({ departure_date: '2021-12-31', who_resigned: 'klient', client_name: 'Stary', recruiter_raw: 'Anna' }),
        dep({ departure_date: null, who_resigned: 'nieznany', client_name: 'ACME', recruiter_raw: null }),
    ]

    it('total respektuje okres, totalAllTime pokazuje całą bazę', () => {
        const a = buildDepartureAnalytics(rows, { period: 'month', client: null, recruiter: null }, NOW)
        expect(a.total).toBe(1) // tylko 2026-07
        expect(a.totalAllTime).toBe(5)
    })

    it('withoutDate liczy braki dat niezależnie od wybranego okresu', () => {
        // Regresja: liczone z `filtered` zawsze dawało 0, bo wiersze bez daty wypadają z zakresu.
        for (const period of ['month', 'quarter', 'year', 'last12', 'all'] as const) {
            const a = buildDepartureAnalytics(rows, { period, client: null, recruiter: null }, NOW)
            expect(a.withoutDate, `okres ${period}`).toBe(1)
        }
    })

    it('trend ignoruje filtr okresu, ale respektuje klienta', () => {
        const monthOnly = buildDepartureAnalytics(rows, { period: 'month', client: null, recruiter: null }, NOW)
        expect(monthOnly.series12m.reduce((s, b) => s + b.total, 0)).toBe(3) // 07/26, 05/26, 09/25 (2021 poza oknem)

        const acme = buildDepartureAnalytics(rows, { period: 'all', client: 'ACME', recruiter: null }, NOW)
        expect(acme.series12m.reduce((s, b) => s + b.total, 0)).toBe(2)
        expect(acme.total).toBe(3) // 'all' bierze też wiersz bez daty
    })

    it('opcje dropdownów pochodzą z pełnego zbioru, nie z bieżącego okresu', () => {
        const a = buildDepartureAnalytics(rows, { period: 'month', client: 'ACME', recruiter: null }, NOW)
        expect(a.clients).toEqual(['ACME', 'Nordea', 'Stary'])
        expect(a.recruiters).toEqual(['Anna', 'Bartek', NO_RECRUITER_LABEL])
    })

    it('przekazuje filtr z powrotem do UI (stan selectów)', () => {
        const a = buildDepartureAnalytics(rows, { period: 'year', client: 'ACME', recruiter: 'Anna' }, NOW)
        expect(a).toMatchObject({ period: 'year', client: 'ACME', recruiter: 'Anna' })
    })
})

describe('recruiterLabel', () => {
    it('normalizuje puste/whitespace do kubła', () => {
        expect(recruiterLabel(null)).toBe(NO_RECRUITER_LABEL)
        expect(recruiterLabel('   ')).toBe(NO_RECRUITER_LABEL)
        expect(recruiterLabel(' Anna ')).toBe('Anna')
    })
})
