import { describe, expect, it } from 'vitest'

import type { AssignmentLike } from '@/lib/tech-map/block-rotation'
import {
    computePlannedBlock,
    nextBlock,
    periodFromDate,
    quarterIndex,
} from '@/lib/tech-map/block-rotation'

const asg = (over: Partial<AssignmentLike> = {}): AssignmentLike => ({
    period_year: 2026,
    period_quarter: 1,
    block: 'B',
    source: 'auto',
    ...over,
})

describe('nextBlock', () => {
    it('cykl B → C → D → B', () => {
        expect(nextBlock('B')).toBe('C')
        expect(nextBlock('C')).toBe('D')
        expect(nextBlock('D')).toBe('B')
    })
})

describe('quarterIndex / periodFromDate', () => {
    it('indeks jest porównywalny między latami', () => {
        expect(quarterIndex(2026, 1)).toBeGreaterThan(quarterIndex(2025, 4))
        expect(quarterIndex(2026, 1) - quarterIndex(2025, 4)).toBe(1)
    })

    it('period z daty: granice kwartałów', () => {
        expect(periodFromDate('2026-01-01')).toEqual({ year: 2026, quarter: 1 })
        expect(periodFromDate('2026-03-31')).toEqual({ year: 2026, quarter: 1 })
        expect(periodFromDate('2026-04-01')).toEqual({ year: 2026, quarter: 2 })
        expect(periodFromDate('2026-08-03')).toEqual({ year: 2026, quarter: 3 })
        expect(periodFromDate('2026-12-31')).toEqual({ year: 2026, quarter: 4 })
    })
})

describe('computePlannedBlock', () => {
    it('bez historii startuje od B (computed)', () => {
        expect(computePlannedBlock([], 2026, 3)).toEqual({
            block: 'B',
            basis: 'computed',
            source: null,
        })
    })

    it('istniejący przydział na kwartał wygrywa (assigned)', () => {
        const result = computePlannedBlock(
            [asg({ period_quarter: 3, block: 'D', source: 'manual' })],
            2026,
            3,
        )
        expect(result).toEqual({ block: 'D', basis: 'assigned', source: 'manual' })
    })

    it('następny w cyklu po ostatnim przydziale sprzed kwartału', () => {
        const result = computePlannedBlock([asg({ period_quarter: 2, block: 'C' })], 2026, 3)
        expect(result).toEqual({ block: 'D', basis: 'computed', source: null })
    })

    it('wybiera NAJPÓŹNIEJSZY przydział sprzed kwartału, nie pierwszy z listy', () => {
        const result = computePlannedBlock(
            [
                asg({ period_year: 2025, period_quarter: 4, block: 'B' }),
                asg({ period_year: 2026, period_quarter: 2, block: 'D' }),
                asg({ period_year: 2026, period_quarter: 1, block: 'C' }),
            ],
            2026,
            3,
        )
        expect(result).toEqual({ block: 'B', basis: 'computed', source: null })
    })

    it('przydziały z PRZYSZŁYCH kwartałów są ignorowane', () => {
        const result = computePlannedBlock(
            [asg({ period_quarter: 4, block: 'D' }), asg({ period_quarter: 2, block: 'B' })],
            2026,
            3,
        )
        expect(result).toEqual({ block: 'C', basis: 'computed', source: null })
    })

    it('luka w historii nie psuje cyklu (Q1 → pominięty Q2 → Q3)', () => {
        const result = computePlannedBlock([asg({ period_quarter: 1, block: 'D' })], 2026, 3)
        expect(result).toEqual({ block: 'B', basis: 'computed', source: null })
    })

    it('przełom roku: Q4 2025 → Q1 2026', () => {
        const result = computePlannedBlock(
            [asg({ period_year: 2025, period_quarter: 4, block: 'B' })],
            2026,
            1,
        )
        expect(result).toEqual({ block: 'C', basis: 'computed', source: null })
    })
})
