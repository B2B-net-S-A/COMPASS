// Phase 46c — KPI mapy technologicznej (czysta agregacja, bez I/O).
// Wzorzec departure-analytics: pure buildTechMapKpi(input, todayISO), akcja tylko
// dowozi wiersze. Bez nazwisk w środku — akcja mapuje tcmId→nazwa po fakcie.

import { projectEndDeadline } from './alert-selection'
import { FRESH_KPI_DAYS, isFresh } from './freshness'

/** Karta sfinalizowana — wejście KPI. */
export interface KpiCard {
    tcmId: string | null
    finalizedAt: string | null
    interviewDate: string
    clientAreaId: string | null
    contractorId: string
    hiring: boolean | null
    projectEndMonth: number | null
    projectEndYear: number | null
}

export interface TechMapKpi {
    /** Wszystkie sfinalizowane karty. */
    totalFinalized: number
    /** Karty sfinalizowane w ostatnich 7 dniach per prowadzący (tcmId → count). */
    cardsLast7dByTcm: Array<{ tcmId: string; count: number }>
    cardsLast7dTotal: number
    /** Pokrycie obszarów danymi <90 dni. pct=null gdy brak obszarów (mianownik 0). */
    areaCoverage: { total: number; fresh: number; pct: number | null }
    /** Aktywne sygnały popytu (hiring=true, karta <90 dni). */
    activeDemandSignals: number
    /** Kontraktorzy, których najnowsza karta wskazuje koniec projektu w ≤90 dni. */
    projectEndsWithin90: number
}

const HORIZON_DAYS = 90

function withinDays(fromISO: string, toISO: string, days: number): boolean {
    const y = Number.parseInt(fromISO.slice(0, 4), 10)
    const m = Number.parseInt(fromISO.slice(5, 7), 10)
    const d = Number.parseInt(fromISO.slice(8, 10), 10)
    const horizon = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
    return toISO >= fromISO && toISO <= horizon
}

/** finalized_at (timestamp) → część daty; interview_date jako fallback. */
function finalizedDay(card: KpiCard): string {
    return (card.finalizedAt ?? card.interviewDate).slice(0, 10)
}

export function buildTechMapKpi(input: {
    cards: KpiCard[]
    /** Wszystkie client_areas — mianownik pokrycia. */
    totalAreas: number
    todayISO: string
}): TechMapKpi {
    const { cards, totalAreas, todayISO } = input

    // ── Karty/tydzień per prowadzący (ostatnie 7 dni po finalized_at)
    const sevenDaysAgo = shiftDays(todayISO, -7)
    const perTcm = new Map<string, number>()
    let last7dTotal = 0
    for (const c of cards) {
        if (!c.tcmId) continue
        if (finalizedDay(c) >= sevenDaysAgo && finalizedDay(c) <= todayISO) {
            perTcm.set(c.tcmId, (perTcm.get(c.tcmId) ?? 0) + 1)
            last7dTotal += 1
        }
    }
    const cardsLast7dByTcm = Array.from(perTcm, ([tcmId, count]) => ({ tcmId, count })).sort(
        (a, b) => b.count - a.count,
    )

    // ── Pokrycie obszarów danymi <90 dni (per obszar: najświeższa karta)
    const latestByArea = new Map<string, string>()
    for (const c of cards) {
        if (!c.clientAreaId) continue
        const cur = latestByArea.get(c.clientAreaId)
        if (!cur || c.interviewDate > cur) latestByArea.set(c.clientAreaId, c.interviewDate)
    }
    let freshAreas = 0
    for (const last of Array.from(latestByArea.values())) {
        if (isFresh(last, todayISO, FRESH_KPI_DAYS)) freshAreas += 1
    }
    const areaCoverage = {
        total: totalAreas,
        fresh: freshAreas,
        pct: totalAreas > 0 ? Math.round((freshAreas / totalAreas) * 100) : null,
    }

    // ── Aktywne sygnały popytu (hiring=true, karta <90 dni)
    const activeDemandSignals = cards.filter(
        (c) => c.hiring === true && isFresh(c.interviewDate, todayISO, FRESH_KPI_DAYS),
    ).length

    // ── Końce projektów w ≤90 dni (najnowsza karta per kontraktor)
    const latestCardPerContractor = new Map<string, KpiCard>()
    for (const c of cards) {
        const cur = latestCardPerContractor.get(c.contractorId)
        if (!cur || c.interviewDate > cur.interviewDate) latestCardPerContractor.set(c.contractorId, c)
    }
    let projectEndsWithin90 = 0
    for (const c of Array.from(latestCardPerContractor.values())) {
        if (c.projectEndMonth === null || c.projectEndYear === null) continue
        const deadline = projectEndDeadline(c.projectEndYear, c.projectEndMonth)
        if (withinDays(todayISO, deadline, HORIZON_DAYS)) projectEndsWithin90 += 1
    }

    return {
        totalFinalized: cards.length,
        cardsLast7dByTcm,
        cardsLast7dTotal: last7dTotal,
        areaCoverage,
        activeDemandSignals,
        projectEndsWithin90,
    }
}

function shiftDays(iso: string, days: number): string {
    const y = Number.parseInt(iso.slice(0, 4), 10)
    const m = Number.parseInt(iso.slice(5, 7), 10)
    const d = Number.parseInt(iso.slice(8, 10), 10)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
