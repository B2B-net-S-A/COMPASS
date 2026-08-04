import { describe, expect, it } from 'vitest'

import { buildTechMapKpi, type KpiCard } from '@/lib/tech-map/analytics'

const TODAY = '2026-08-04'

const card = (over: Partial<KpiCard> = {}): KpiCard => ({
    tcmId: 'tcm-1',
    finalizedAt: '2026-08-01T10:00:00Z',
    interviewDate: '2026-08-01',
    clientAreaId: null,
    contractorId: 'k1',
    hiring: null,
    projectEndMonth: null,
    projectEndYear: null,
    ...over,
})

describe('buildTechMapKpi — karty/tydzień per prowadzący', () => {
    it('liczy karty z ostatnich 7 dni per TCM, malejąco', () => {
        const kpi = buildTechMapKpi({
            cards: [
                card({ tcmId: 'a', finalizedAt: '2026-08-03T10:00:00Z' }),
                card({ tcmId: 'a', finalizedAt: '2026-08-02T10:00:00Z' }),
                card({ tcmId: 'b', finalizedAt: '2026-08-01T10:00:00Z' }),
                card({ tcmId: 'a', finalizedAt: '2026-07-01T10:00:00Z' }), // poza 7 dni
            ],
            totalAreas: 0,
            todayISO: TODAY,
        })
        expect(kpi.cardsLast7dByTcm).toEqual([
            { tcmId: 'a', count: 2 },
            { tcmId: 'b', count: 1 },
        ])
        expect(kpi.cardsLast7dTotal).toBe(3)
        expect(kpi.totalFinalized).toBe(4)
    })

    it('używa interview_date gdy brak finalized_at', () => {
        const kpi = buildTechMapKpi({
            cards: [card({ finalizedAt: null, interviewDate: '2026-08-03' })],
            totalAreas: 0,
            todayISO: TODAY,
        })
        expect(kpi.cardsLast7dTotal).toBe(1)
    })
})

describe('buildTechMapKpi — pokrycie obszarów', () => {
    it('% obszarów z danymi <90 dni; mianownik = wszystkie obszary', () => {
        const kpi = buildTechMapKpi({
            cards: [
                card({ clientAreaId: 'obsz-1', interviewDate: '2026-08-01' }), // świeży
                card({ clientAreaId: 'obsz-2', interviewDate: '2026-01-01' }), // stary >90d
            ],
            totalAreas: 4, // 4 obszary istnieją, 1 świeży
            todayISO: TODAY,
        })
        expect(kpi.areaCoverage).toEqual({ total: 4, fresh: 1, pct: 25 })
    })

    it('pct=null gdy brak obszarów', () => {
        const kpi = buildTechMapKpi({ cards: [], totalAreas: 0, todayISO: TODAY })
        expect(kpi.areaCoverage.pct).toBeNull()
    })

    it('najświeższa karta w obszarze decyduje', () => {
        const kpi = buildTechMapKpi({
            cards: [
                card({ clientAreaId: 'o1', interviewDate: '2026-01-01' }),
                card({ clientAreaId: 'o1', interviewDate: '2026-08-01' }),
            ],
            totalAreas: 1,
            todayISO: TODAY,
        })
        expect(kpi.areaCoverage.fresh).toBe(1)
    })
})

describe('buildTechMapKpi — sygnały popytu i końce projektów', () => {
    it('aktywne sygnały popytu = hiring=true i karta <90 dni', () => {
        const kpi = buildTechMapKpi({
            cards: [
                card({ hiring: true, interviewDate: '2026-08-01' }), // aktywny
                card({ hiring: true, interviewDate: '2026-01-01' }), // stary >90d
                card({ hiring: false, interviewDate: '2026-08-01' }),
            ],
            totalAreas: 0,
            todayISO: TODAY,
        })
        expect(kpi.activeDemandSignals).toBe(1)
    })

    it('końce projektów w 90 dni — najnowsza karta per kontraktor', () => {
        const kpi = buildTechMapKpi({
            cards: [
                card({ contractorId: 'k1', interviewDate: '2026-08-01', projectEndMonth: 9, projectEndYear: 2026 }),
                card({ contractorId: 'k2', interviewDate: '2026-08-01', projectEndMonth: 12, projectEndYear: 2026 }), // >90d
            ],
            totalAreas: 0,
            todayISO: TODAY,
        })
        expect(kpi.projectEndsWithin90).toBe(1)
    })

    it('nowsza karta nadpisuje starszą przy końcu projektu', () => {
        const kpi = buildTechMapKpi({
            cards: [
                card({ contractorId: 'k1', interviewDate: '2026-05-01', projectEndMonth: 9, projectEndYear: 2026 }),
                card({ contractorId: 'k1', interviewDate: '2026-08-01', projectEndMonth: 12, projectEndYear: 2026 }),
            ],
            totalAreas: 0,
            todayISO: TODAY,
        })
        expect(kpi.projectEndsWithin90).toBe(0)
    })
})
