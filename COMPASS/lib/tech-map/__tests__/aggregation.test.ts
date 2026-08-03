import { describe, expect, it } from 'vitest'

import { buildClientTechMap, type AggCard } from '@/lib/tech-map/aggregation'

const TODAY = '2026-08-03'

const card = (over: Partial<AggCard> = {}): AggCard => ({
    id: 'card-1',
    client_area_id: null,
    interview_date: '2026-07-01',
    block: 'B',
    hiring: null,
    hiring_roles: [],
    hiring_source: null,
    project_end_month: null,
    project_end_year: null,
    project_end_unknown: false,
    tech_old_new: null,
    vendors_note: null,
    memorable_quote: null,
    team_size: null,
    team_externals: null,
    ...over,
})

const base = {
    areas: [{ id: 'a-1', name: 'Bankowość detaliczna' }],
    technologies: [
        { id: 't-1', name: 'Java' },
        { id: 't-2', name: 'Kubernetes' },
    ],
    vendors: [{ id: 'v-1', name: 'Accenture' }],
    todayISO: TODAY,
}

describe('buildClientTechMap — technologie', () => {
    it('zlicza wskazania i bierze najświeższą datę potwierdzenia', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', interview_date: '2026-03-01' }),
                card({ id: 'c2', interview_date: '2026-07-15' }),
            ],
            techLinks: [
                { card_id: 'c1', ref_id: 't-1' },
                { card_id: 'c2', ref_id: 't-1' },
                { card_id: 'c2', ref_id: 't-2' },
            ],
            vendorLinks: [],
            initiatives: [],
        })

        expect(map.technologies[0]).toMatchObject({ name: 'Java', mentions: 2, lastConfirmed: '2026-07-15' })
        expect(map.technologies[1]).toMatchObject({ name: 'Kubernetes', mentions: 1 })
    })

    it('oznacza jako do odświeżenia dane starsze niż 6 miesięcy', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [card({ id: 'c1', interview_date: '2025-12-01' })],
            techLinks: [{ card_id: 'c1', ref_id: 't-1' }],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.technologies[0].stale).toBe(true)
    })

    it('zbiera obszary bez duplikatów i pomija linki do nieistniejących kart', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', client_area_id: 'a-1' }),
                card({ id: 'c2', client_area_id: 'a-1' }),
            ],
            techLinks: [
                { card_id: 'c1', ref_id: 't-1' },
                { card_id: 'c2', ref_id: 't-1' },
                { card_id: 'GHOST', ref_id: 't-2' },
            ],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.technologies).toHaveLength(1)
        expect(map.technologies[0].areas).toEqual(['Bankowość detaliczna'])
    })
})

describe('buildClientTechMap — inicjatywy', () => {
    it('scala po nazwie i rodzaju, priorytet wysoki wygrywa', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', interview_date: '2026-05-01' }),
                card({ id: 'c2', interview_date: '2026-07-01' }),
            ],
            techLinks: [],
            vendorLinks: [],
            initiatives: [
                { card_id: 'c1', name: 'Migracja do chmury', kind: 'migracja', priority: 'normalny' },
                { card_id: 'c2', name: 'migracja do chmury', kind: 'migracja', priority: 'wysoki' },
            ],
        })
        expect(map.initiatives).toHaveLength(1)
        expect(map.initiatives[0]).toMatchObject({
            mentions: 2,
            highPriority: true,
            lastConfirmed: '2026-07-01',
        })
    })

    it('ta sama nazwa w innym rodzaju to osobna inicjatywa', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [card({ id: 'c1' })],
            techLinks: [],
            vendorLinks: [],
            initiatives: [
                { card_id: 'c1', name: 'Portal', kind: 'nowy_system', priority: 'normalny' },
                { card_id: 'c1', name: 'Portal', kind: 'migracja', priority: 'normalny' },
            ],
        })
        expect(map.initiatives).toHaveLength(2)
    })
})

describe('buildClientTechMap — sygnały popytu i końce projektów', () => {
    it('bierze tylko karty z hiring=TRUE i odsiewa puste role', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', hiring: true, hiring_roles: ['Java Developer', '  '], hiring_source: 'widzial' }),
                card({ id: 'c2', hiring: false }),
                card({ id: 'c3', hiring: null }),
            ],
            techLinks: [],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.demandSignals).toHaveLength(1)
        expect(map.demandSignals[0].roles).toEqual(['Java Developer'])
    })

    it('oś końców projektów pomija „nie wie" i sortuje chronologicznie', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', project_end_month: 12, project_end_year: 2026 }),
                card({ id: 'c2', project_end_month: 3, project_end_year: 2026 }),
                card({ id: 'c3', project_end_unknown: true }),
            ],
            techLinks: [],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.projectEnds.map((p) => p.period)).toEqual(['2026-03', '2026-12'])
    })
})

describe('buildClientTechMap — pokrycie obszary × bloki', () => {
    it('obszar bez kart ma wszystkie bloki jako brakujące', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [],
            techLinks: [],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.coverage).toHaveLength(1)
        expect(map.coverage[0].missingBlocks).toEqual(['B', 'C', 'D'])
        expect(map.coverage[0].lastAny).toBeNull()
    })

    it('rozróżnia bloki brakujące od przeterminowanych', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', client_area_id: 'a-1', block: 'B', interview_date: '2026-07-01' }),
                card({ id: 'c2', client_area_id: 'a-1', block: 'C', interview_date: '2025-01-01' }),
            ],
            techLinks: [],
            vendorLinks: [],
            initiatives: [],
        })
        const cov = map.coverage[0]
        expect(cov.missingBlocks).toEqual(['D'])
        expect(cov.staleBlocks).toEqual(['C'])
        expect(cov.lastByBlock.B).toBe('2026-07-01')
    })

    it('karty bez obszaru trafiają do osobnego wiersza „bez obszaru"', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [card({ id: 'c1', client_area_id: null })],
            techLinks: [],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.coverage).toHaveLength(2)
        expect(map.coverage[1].areaId).toBeNull()
    })
})

describe('buildClientTechMap — notatki, zespół, prywatność', () => {
    it('zbiera notatki z datą, malejąco', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', interview_date: '2026-05-01', memorable_quote: 'Stary system boli.' }),
                card({ id: 'c2', interview_date: '2026-07-01', tech_old_new: 'Z Javy 8 na 21.' }),
            ],
            techLinks: [],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.notes.map((n) => n.kind)).toEqual(['tech_old_new', 'quote'])
        expect(map.notes[0].date).toBe('2026-07-01')
    })

    it('wielkość zespołu bierze z najnowszej karty, która ją podała', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [
                card({ id: 'c1', interview_date: '2026-07-01', team_size: 12, team_externals: 5 }),
                card({ id: 'c2', interview_date: '2026-07-20' }),
            ],
            techLinks: [],
            vendorLinks: [],
            initiatives: [],
        })
        expect(map.teamSizeLatest).toEqual({ size: 12, externals: 5, date: '2026-07-01' })
    })

    it('wynik nie zawiera żadnych identyfikatorów kart ani konsultantów', () => {
        const map = buildClientTechMap({
            ...base,
            cards: [card({ id: 'card-tajne', hiring: true, hiring_roles: ['DevOps'] })],
            techLinks: [{ card_id: 'card-tajne', ref_id: 't-1' }],
            vendorLinks: [],
            initiatives: [{ card_id: 'card-tajne', name: 'X', kind: 'inne', priority: 'normalny' }],
        })
        expect(JSON.stringify(map)).not.toContain('card-tajne')
    })
})
