import { describe, it, expect } from 'vitest'
import { oofScheduledToDates, computeMissingRuns } from '../oof-dates'

const utc = (dateTime: string) => ({ dateTime, timeZone: 'UTC' })

describe('oofScheduledToDates', () => {
    it('inclusive afternoon end (real user OOF) — Klaudia 03–12.06', () => {
        // start 04:00Z = 06:00 CEST on the 3rd; end 14:00Z = 16:00 CEST on the 12th (inclusive)
        expect(
            oofScheduledToDates(utc('2026-06-03T04:00:00.0000000'), utc('2026-06-12T14:00:00.0000000')),
        ).toEqual({ startDate: '2026-06-03', endDate: '2026-06-12' })
    })

    it('Warsaw-midnight end is exclusive — 22:00Z = 00:00 CEST next day', () => {
        // start 22:00Z = 00:00 CEST on the 8th; end 22:00Z = 00:00 CEST on the 13th → exclusive → 12th
        expect(oofScheduledToDates(utc('2026-06-07T22:00:00'), utc('2026-06-12T22:00:00'))).toEqual({
            startDate: '2026-06-08',
            endDate: '2026-06-12',
        })
    })

    it('returns null on missing / unparseable input', () => {
        expect(oofScheduledToDates(null, utc('2026-06-12T14:00:00'))).toBeNull()
        expect(oofScheduledToDates(utc('not-a-date'), utc('2026-06-12T14:00:00'))).toBeNull()
    })
})

const hol = (date: string) => ({ date, name_pl: 'święto' })
const span = (start_date: string, end_date: string) => ({
    start_date,
    end_date,
    half_day: null,
    leave_type: 'vacation',
})

describe('computeMissingRuns', () => {
    it('Klaudia: OOF 03–12, covered 03 + 08–12, 04 holiday, 06–07 weekend → only 05', () => {
        expect(
            computeMissingRuns(
                { startDate: '2026-06-03', endDate: '2026-06-12' },
                [span('2026-06-03', '2026-06-03'), span('2026-06-08', '2026-06-12')],
                [hol('2026-06-04')],
            ),
        ).toEqual([{ startDate: '2026-06-05', endDate: '2026-06-05' }])
    })

    it('fully uncovered Mon–Fri collapses to a single run', () => {
        expect(computeMissingRuns({ startDate: '2026-06-08', endDate: '2026-06-12' }, [], [])).toEqual([
            { startDate: '2026-06-08', endDate: '2026-06-12' },
        ])
    })

    it('a covered working day in the middle splits the run', () => {
        // 08 Mon..12 Fri, covered 10 Wed → [08–09], [11–12]
        expect(
            computeMissingRuns(
                { startDate: '2026-06-08', endDate: '2026-06-12' },
                [span('2026-06-10', '2026-06-10')],
                [],
            ),
        ).toEqual([
            { startDate: '2026-06-08', endDate: '2026-06-09' },
            { startDate: '2026-06-11', endDate: '2026-06-12' },
        ])
    })

    it('a run spans a weekend (Fri + Mon both missing) → single Fri–Mon run', () => {
        // 05 Fri (missing), 06–07 weekend, 08 Mon (missing) → one run 05–08
        expect(computeMissingRuns({ startDate: '2026-06-05', endDate: '2026-06-08' }, [], [])).toEqual([
            { startDate: '2026-06-05', endDate: '2026-06-08' },
        ])
    })

    it('all covered → no runs', () => {
        expect(
            computeMissingRuns(
                { startDate: '2026-06-08', endDate: '2026-06-12' },
                [span('2026-06-08', '2026-06-12')],
                [],
            ),
        ).toEqual([])
    })

    it('weekend-only range → no runs', () => {
        expect(computeMissingRuns({ startDate: '2026-06-06', endDate: '2026-06-07' }, [], [])).toEqual([])
    })
})
