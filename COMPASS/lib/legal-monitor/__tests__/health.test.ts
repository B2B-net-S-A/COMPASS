import { describe, it, expect } from 'vitest'
import {
    computeMonitorHealth,
    missedWorkingDaysSince,
    sortItemsForReview,
    STALE_AFTER_HOURS,
} from '../health'
import type { LegalMonitorRunRow } from '../../types/legal-monitor'

const NO_HOLIDAYS: Array<{ date: string; name_pl: string }> = []

// 2026-08-10 to poniedziałek; 2026-08-14 piątek, 15-16 weekend, 17 poniedziałek.
function run(overrides: Partial<LegalMonitorRunRow> = {}): LegalMonitorRunRow {
    return {
        id: 'run-1',
        run_at: '2026-08-10T05:30:00Z',
        window_from: '2026-08-09',
        status: 'ok',
        items_found: 3,
        sources_checked: { GIP: 'ok', SN: 'empty' },
        notes: null,
        ...overrides,
    }
}

describe('missedWorkingDaysSince', () => {
    it('nie liczy zaległości gdy przebieg był dzisiaj', () => {
        const last = new Date('2026-08-10T05:30:00Z')
        const now = new Date('2026-08-10T16:00:00Z')
        expect(missedWorkingDaysSince(last, now, NO_HOLIDAYS)).toBe(0)
    })

    it('nie alarmuje przez weekend po przebiegu w piątek', () => {
        const friday = new Date('2026-08-14T05:30:00Z')
        const sunday = new Date('2026-08-16T14:00:00Z')
        expect(missedWorkingDaysSince(friday, sunday, NO_HOLIDAYS)).toBe(0)
    })

    it('nie alarmuje w poniedziałek rano, zanim cron zdąży', () => {
        const friday = new Date('2026-08-14T05:30:00Z')
        const mondayEarly = new Date('2026-08-17T04:00:00Z') // 06:00 w Warszawie
        expect(missedWorkingDaysSince(friday, mondayEarly, NO_HOLIDAYS)).toBe(0)
    })

    it('alarmuje w poniedziałek po 10:00 gdy przebiegu nie ma', () => {
        const friday = new Date('2026-08-14T05:30:00Z')
        const mondayNoon = new Date('2026-08-17T10:00:00Z') // 12:00 w Warszawie
        expect(missedWorkingDaysSince(friday, mondayNoon, NO_HOLIDAYS)).toBe(1)
    })

    it('pomija święta z public_holidays', () => {
        const friday = new Date('2026-08-14T05:30:00Z')
        const mondayNoon = new Date('2026-08-17T10:00:00Z')
        const holidays = [{ date: '2026-08-17', name_pl: 'Święto testowe' }]
        expect(missedWorkingDaysSince(friday, mondayNoon, holidays)).toBe(0)
    })

    it('liczy narastająco kolejne pominięte dni robocze', () => {
        const monday = new Date('2026-08-10T05:30:00Z')
        const thursdayNoon = new Date('2026-08-13T10:00:00Z')
        // wt, śr, czw = 3
        expect(missedWorkingDaysSince(monday, thursdayNoon, NO_HOLIDAYS)).toBe(3)
    })

    it('zwraca 0 gdy „teraz" wypada przed ostatnim przebiegiem (zegar w tył)', () => {
        const last = new Date('2026-08-10T05:30:00Z')
        const earlier = new Date('2026-08-09T05:30:00Z')
        expect(missedWorkingDaysSince(last, earlier, NO_HOLIDAYS)).toBe(0)
    })
})

describe('computeMonitorHealth', () => {
    it('brak jakiegokolwiek przebiegu → never', () => {
        const h = computeMonitorHealth({
            lastRun: null,
            now: new Date('2026-08-10T10:00:00Z'),
            holidays: NO_HOLIDAYS,
        })
        expect(h.state).toBe('never')
        expect(h.tone).toBe('warning')
        expect(h.lastRunAt).toBeNull()
        expect(h.ageHours).toBeNull()
    })

    it('świeży przebieg ok → ok/success', () => {
        const h = computeMonitorHealth({
            lastRun: run(),
            now: new Date('2026-08-10T08:00:00Z'),
            holidays: NO_HOLIDAYS,
        })
        expect(h.state).toBe('ok')
        expect(h.tone).toBe('success')
        expect(h.ageHours).toBe(2)
        expect(h.failedSources).toEqual([])
    })

    it('partial wypisuje źródła, które padły', () => {
        const h = computeMonitorHealth({
            lastRun: run({
                status: 'partial',
                sources_checked: { GIP: 'ok', SEJM_RCL: 'fail', TK: 'empty', ZUS: 'fail' },
                notes: 'api.sejm.gov.pl niedostępne',
            }),
            now: new Date('2026-08-10T08:00:00Z'),
            holidays: NO_HOLIDAYS,
        })
        expect(h.state).toBe('partial')
        expect(h.tone).toBe('warning')
        expect(h.failedSources).toEqual(['SEJM_RCL', 'ZUS'])
        expect(h.notes).toContain('sejm')
    })

    it('failed → danger', () => {
        const h = computeMonitorHealth({
            lastRun: run({ status: 'failed' }),
            now: new Date('2026-08-10T08:00:00Z'),
            holidays: NO_HOLIDAYS,
        })
        expect(h.state).toBe('failed')
        expect(h.tone).toBe('danger')
    })

    it('zaległość wygrywa nad statusem partial', () => {
        const h = computeMonitorHealth({
            lastRun: run({ run_at: '2026-08-14T05:30:00Z', status: 'partial' }),
            now: new Date('2026-08-17T10:00:00Z'),
            holidays: NO_HOLIDAYS,
        })
        expect(h.state).toBe('stale')
        expect(h.tone).toBe('danger')
        expect(h.missedWorkingDays).toBe(1)
    })

    it('sam wiek > 26 h nie wystarcza — weekend nie alarmuje', () => {
        const now = new Date('2026-08-16T14:00:00Z') // niedziela
        const h = computeMonitorHealth({
            lastRun: run({ run_at: '2026-08-14T05:30:00Z' }),
            now,
            holidays: NO_HOLIDAYS,
        })
        expect(h.ageHours).toBeGreaterThan(STALE_AFTER_HOURS)
        expect(h.state).toBe('ok')
    })

    it('pominięty dzień roboczy przy wieku ≤ 26 h nie jest zaległością', () => {
        // Przebieg w pon. 23:00 czasu warszawskiego, „teraz" wt. 11:00 — kalendarzowo
        // minął nowy dzień roboczy, ale wiek to tylko 12 h; próg 26 h chroni przed
        // fałszywym alarmem po przebiegu wykonanym późnym wieczorem.
        const h = computeMonitorHealth({
            lastRun: run({ run_at: '2026-08-10T21:00:00Z' }),
            now: new Date('2026-08-11T09:00:00Z'),
            holidays: NO_HOLIDAYS,
        })
        expect(h.missedWorkingDays).toBe(1)
        expect(h.ageHours).toBeLessThanOrEqual(STALE_AFTER_HOURS)
        expect(h.state).toBe('ok')
    })

    it('znosi puste/uszkodzone sources_checked', () => {
        const h = computeMonitorHealth({
            lastRun: run({ sources_checked: {} }),
            now: new Date('2026-08-10T08:00:00Z'),
            holidays: NO_HOLIDAYS,
        })
        expect(h.failedSources).toEqual([])
    })
})

describe('sortItemsForReview', () => {
    const item = (
        id: string,
        severity: 'red' | 'yellow' | 'green',
        published_at: string | null,
        created_at = '2026-08-01T00:00:00Z',
    ) => ({ id, severity, published_at, created_at })

    it('sortuje wg pilności przed datą', () => {
        const sorted = sortItemsForReview([
            item('a', 'green', '2026-08-09'),
            item('b', 'red', '2026-07-01'),
            item('c', 'yellow', '2026-08-10'),
        ])
        expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a'])
    })

    it('w obrębie pilności — najświeższe najpierw', () => {
        const sorted = sortItemsForReview([
            item('old', 'red', '2026-06-01'),
            item('new', 'red', '2026-08-01'),
        ])
        expect(sorted.map((i) => i.id)).toEqual(['new', 'old'])
    })

    it('bez published_at używa daty dopisania', () => {
        const sorted = sortItemsForReview([
            item('brak-daty', 'red', null, '2026-08-20T00:00:00Z'),
            item('z-datą', 'red', '2026-08-05'),
        ])
        expect(sorted.map((i) => i.id)).toEqual(['brak-daty', 'z-datą'])
    })

    it('jest deterministyczny przy identycznych kluczach i nie mutuje wejścia', () => {
        const input = [item('b', 'red', '2026-08-01'), item('a', 'red', '2026-08-01')]
        const snapshot = input.map((i) => i.id)
        expect(sortItemsForReview(input).map((i) => i.id)).toEqual(['a', 'b'])
        expect(input.map((i) => i.id)).toEqual(snapshot)
    })
})
