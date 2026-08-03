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
