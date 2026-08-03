import { describe, expect, it } from 'vitest'

import {
    computeRotationInserts,
    type RotationCandidate,
} from '@/lib/tech-map/block-rotation'

const candidate = (over: Partial<RotationCandidate> = {}): RotationCandidate => ({
    contractorId: 'c-1',
    assignments: [],
    ...over,
})

describe('computeRotationInserts', () => {
    it('kontraktor bez historii dostaje start cyklu (B)', () => {
        const inserts = computeRotationInserts([candidate()], 2026, 3)
        expect(inserts).toEqual([
            { contractor_id: 'c-1', period_year: 2026, period_quarter: 3, block: 'B', source: 'auto' },
        ])
    })

    it('kontraktor z przydziałem na ten kwartał jest pomijany (idempotencja crona)', () => {
        const inserts = computeRotationInserts(
            [
                candidate({
                    assignments: [
                        { period_year: 2026, period_quarter: 3, block: 'C', source: 'auto' },
                    ],
                }),
            ],
            2026,
            3,
        )
        expect(inserts).toEqual([])
    })

    it('ręczny override nie jest nadpisywany', () => {
        const inserts = computeRotationInserts(
            [
                candidate({
                    assignments: [
                        { period_year: 2026, period_quarter: 3, block: 'D', source: 'manual' },
                    ],
                }),
            ],
            2026,
            3,
        )
        expect(inserts).toEqual([])
    })

    it('kontynuuje cykl po ostatnim przydziale sprzed kwartału', () => {
        const inserts = computeRotationInserts(
            [
                candidate({
                    assignments: [
                        { period_year: 2026, period_quarter: 2, block: 'C', source: 'auto' },
                    ],
                }),
            ],
            2026,
            3,
        )
        expect(inserts[0].block).toBe('D')
    })

    it('miesza kandydatów: część pomijana, część z różnymi blokami', () => {
        const inserts = computeRotationInserts(
            [
                candidate({ contractorId: 'nowy' }),
                candidate({
                    contractorId: 'ma-przydzial',
                    assignments: [{ period_year: 2026, period_quarter: 3, block: 'B', source: 'auto' }],
                }),
                candidate({
                    contractorId: 'kontynuuje',
                    assignments: [{ period_year: 2026, period_quarter: 2, block: 'D', source: 'manual' }],
                }),
            ],
            2026,
            3,
        )
        expect(inserts.map((i) => [i.contractor_id, i.block])).toEqual([
            ['nowy', 'B'],
            ['kontynuuje', 'B'],
        ])
    })

    it('pusta populacja daje pustą listę', () => {
        expect(computeRotationInserts([], 2026, 3)).toEqual([])
    })
})
