// Phase 46 — rotacja bloków wywiadu B→C→D per kontraktor per kwartał (czysta).
// Jedyne źródło prawdy o przydziałach to tabela tech_block_assignments —
// te funkcje liczą „co by wypadło", a materializacją zajmują się: cron (PR2),
// przycisk admina (PR2) i fallback przy zapisie karty (akcja createCardDraft).
// Render (widok „przed rozmową") woła computePlannedBlock BEZ zapisu —
// zero side-effectów w renderze (audyt 2026-07-16 P1.8).

import type { BlockAssignmentSource, InterviewBlock } from '@/lib/types/tech-map'

export interface AssignmentLike {
    period_year: number
    period_quarter: number
    block: InterviewBlock
    source: BlockAssignmentSource
}

export interface PlannedBlock {
    block: InterviewBlock
    /** 'assigned' = istnieje wiersz na ten kwartał; 'computed' = wyliczone z cyklu (bez zapisu). */
    basis: 'assigned' | 'computed'
    source: BlockAssignmentSource | null
}

const CYCLE: InterviewBlock[] = ['B', 'C', 'D']

export function nextBlock(block: InterviewBlock): InterviewBlock {
    const idx = CYCLE.indexOf(block)
    return CYCLE[(idx + 1) % CYCLE.length]
}

/** Absolutny indeks kwartału — porównywalny między latami. */
export function quarterIndex(year: number, quarter: number): number {
    return year * 4 + (quarter - 1)
}

/** Rok + kwartał z daty ISO (YYYY-MM-DD) — parsowanie stringa, bez stref czasowych. */
export function periodFromDate(isoDate: string): { year: number; quarter: number } {
    const year = Number.parseInt(isoDate.slice(0, 4), 10)
    const month = Number.parseInt(isoDate.slice(5, 7), 10)
    return { year, quarter: Math.floor((month - 1) / 3) + 1 }
}

/**
 * Granice kwartału jako [start, endExclusive) — pierwszy dzień tego kwartału
 * i pierwszy dzień następnego.
 *
 * Koniec jest WYŁĄCZNY celowo: „ostatni dzień kwartału" wymagałby znajomości
 * długości miesiąca, a naiwne `-31` daje nieistniejące 06-31 / 09-31 (Q2, Q3),
 * co Postgres odrzuca błędem. Półotwarty przedział omija problem całkowicie.
 */
export function quarterBounds(year: number, quarter: number): { start: string; endExclusive: string } {
    const startMonth = (quarter - 1) * 3 + 1
    const nextYear = quarter === 4 ? year + 1 : year
    const nextMonth = quarter === 4 ? 1 : startMonth + 3
    return {
        start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        endExclusive: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    }
}

/**
 * Blok planowany na (year, quarter):
 * - istnieje przydział na ten kwartał → jego blok (basis 'assigned');
 * - inaczej: następny w cyklu po NAJPÓŹNIEJSZYM przydziale sprzed tego kwartału;
 * - brak jakiejkolwiek historii → 'B' (start cyklu).
 */
export function computePlannedBlock(
    assignments: AssignmentLike[],
    year: number,
    quarter: number,
): PlannedBlock {
    const target = quarterIndex(year, quarter)

    const current = assignments.find(
        (a) => quarterIndex(a.period_year, a.period_quarter) === target,
    )
    if (current) return { block: current.block, basis: 'assigned', source: current.source }

    let latestBefore: AssignmentLike | null = null
    for (const a of assignments) {
        const idx = quarterIndex(a.period_year, a.period_quarter)
        if (idx >= target) continue
        if (
            latestBefore === null ||
            idx > quarterIndex(latestBefore.period_year, latestBefore.period_quarter)
        ) {
            latestBefore = a
        }
    }

    if (latestBefore) return { block: nextBlock(latestBefore.block), basis: 'computed', source: null }
    return { block: 'B', basis: 'computed', source: null }
}

// ─── Przemiatanie kwartalne (Etap 2: cron + przycisk admina) ────────────────

export interface RotationCandidate {
    contractorId: string
    /** Wszystkie dotychczasowe przydziały tego kontraktora. */
    assignments: AssignmentLike[]
}

export interface RotationInsert {
    contractor_id: string
    period_year: number
    period_quarter: number
    block: InterviewBlock
    source: 'auto'
}

/**
 * Wiersze do wstawienia dla (year, quarter): po jednym na kontraktora, który
 * NIE ma jeszcze przydziału na ten kwartał. Kontraktorzy z przydziałem —
 * automatycznym czy ręcznym — są pomijani, więc override admina jest lepki,
 * a wielokrotne uruchomienie crona nic nie zmienia (idempotencja).
 *
 * Populację (aktywni kontraktorzy) wybiera warstwa danych — tu wchodzi już
 * gotowa lista kandydatów.
 */
export function computeRotationInserts(
    candidates: RotationCandidate[],
    year: number,
    quarter: number,
): RotationInsert[] {
    const inserts: RotationInsert[] = []
    for (const c of candidates) {
        const planned = computePlannedBlock(c.assignments, year, quarter)
        if (planned.basis === 'assigned') continue
        inserts.push({
            contractor_id: c.contractorId,
            period_year: year,
            period_quarter: quarter,
            block: planned.block,
            source: 'auto',
        })
    }
    return inserts
}
