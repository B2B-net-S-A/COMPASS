import { describe, expect, it } from 'vitest'
import {
    buildPeopleResolutions,
    classifyRow,
    computeBonusFields,
    findDisappeared,
    marginMismatch,
    resolvePersonName,
    scoreNameMatch,
    type ExistingPlacementKey,
    type ProfileLite,
} from '../import'
import { placementNaturalKey, type ParsedPlacementRow } from '@/lib/types/placement'

function row(overrides: Partial<ParsedPlacementRow> = {}): ParsedPlacementRow {
    return {
        rowNumber: 2,
        consultantName: 'Adam Sadowski',
        clientName: 'NORDEA',
        position: 'Tester Automatyzujący',
        deliveryLeadRaw: 'Marcin Kraszewski',
        recruiterRaw: 'Aleksandra Jaczyńska',
        costRate: 130,
        revenueRate: 175,
        signingDate: '2026-01-23',
        startDate: '2026-04-01',
        marginFromFile: 45,
        monthlyMarginFromFile: 7560,
        ...overrides,
    }
}

describe('computeBonusFields', () => {
    it('computes margin, monthly margin, DL 10% and recruiter tier (Excel row 2)', () => {
        const f = computeBonusFields(row())
        expect(f.marginPerHour).toBe(45)
        expect(f.monthlyMargin).toBe(7560) // 45 * 168
        expect(f.dlBonusAmount).toBe(756) // 7560 * 10%
        expect(f.recruiterTier).toBe(2) // 40 < 45 < 50
        expect(f.recruiterBonusAmount).toBe(1500)
    })

    it('eligibility date = start + 21 business days (weekends skipped)', () => {
        // 2026-04-01 is a Wednesday → +21 business days = 2026-04-30 (Thursday).
        expect(computeBonusFields(row()).bonusEligibleDate).toBe('2026-04-30')
    })

    it('recruiter tier boundaries: <=40 → tier1/1000, =50 → tier3/2000', () => {
        const t1 = computeBonusFields(row({ costRate: 100, revenueRate: 140 })) // margin 40
        expect(t1.recruiterTier).toBe(1)
        expect(t1.recruiterBonusAmount).toBe(1000)

        const t3 = computeBonusFields(row({ costRate: 100, revenueRate: 150 })) // margin 50
        expect(t3.recruiterTier).toBe(3)
        expect(t3.recruiterBonusAmount).toBe(2000)

        const t2 = computeBonusFields(row({ costRate: 100, revenueRate: 145 })) // margin 45
        expect(t2.recruiterTier).toBe(2)
    })

    it('throws on negative margin', () => {
        expect(() => computeBonusFields(row({ costRate: 200, revenueRate: 100 }))).toThrow()
    })
})

describe('marginMismatch', () => {
    it('false when file margin matches computed', () => {
        const r = row()
        expect(marginMismatch(r, computeBonusFields(r))).toBe(false)
    })
    it('true when file margin disagrees', () => {
        const r = row({ marginFromFile: 40 })
        expect(marginMismatch(r, computeBonusFields(r))).toBe(true)
    })
    it('false when file margin absent', () => {
        const r = row({ marginFromFile: null })
        expect(marginMismatch(r, computeBonusFields(r))).toBe(false)
    })
})

describe('scoreNameMatch', () => {
    it('exact normalized match = 1', () => {
        expect(scoreNameMatch('marcin kraszewski', 'Marcin Kraszewski')).toBe(1)
    })
    it('partial token overlap is between 0 and 1', () => {
        const s = scoreNameMatch('marcin kraszewski', 'Marcin Nowak')
        expect(s).toBeGreaterThan(0)
        expect(s).toBeLessThan(1)
    })
    it('no overlap = 0', () => {
        expect(scoreNameMatch('marcin kraszewski', 'Jan Nowak')).toBe(0)
    })
})

const PROFILES: ProfileLite[] = [
    { id: 'dl-marcin', full_name: 'Marcin Kraszewski', role: 'manager' },
    { id: 'rec-ola', full_name: 'Aleksandra Jaczyńska', role: 'internal' },
    { id: 'rec-anna', full_name: 'Anna Michalska', role: 'internal' },
]

describe('resolvePersonName', () => {
    it('alias hit takes priority as suggested profile', () => {
        const res = resolvePersonName('M. Kraszewski', PROFILES, 'dl-marcin')
        expect(res.suggestedProfileId).toBe('dl-marcin')
    })
    it('exact name auto-suggests the matching profile', () => {
        const res = resolvePersonName('Marcin Kraszewski', PROFILES, null)
        expect(res.suggestedProfileId).toBe('dl-marcin')
        expect(res.suggestions[0].id).toBe('dl-marcin')
    })
    it('unknown name → no auto-suggest', () => {
        const res = resolvePersonName('Zbigniew Brzęczyszczykiewicz', PROFILES, null)
        expect(res.suggestedProfileId).toBeNull()
    })
})

describe('buildPeopleResolutions', () => {
    it('dedupes a person who is both DL and recruiter into one entry', () => {
        const rows = [
            row({ deliveryLeadRaw: 'Marcin Kraszewski', recruiterRaw: 'Aleksandra Jaczyńska' }),
            row({ deliveryLeadRaw: 'Marcin Kraszewski', recruiterRaw: 'Marcin Kraszewski' }),
        ]
        const people = buildPeopleResolutions(rows, PROFILES, new Map())
        const names = people.map((p) => p.rawName)
        expect(names.filter((n) => n === 'Marcin Kraszewski')).toHaveLength(1)
    })
})

describe('classifyRow / findDisappeared', () => {
    const existing: ExistingPlacementKey = {
        id: 'p1',
        consultant_name: 'Adam Sadowski',
        client_name: 'NORDEA',
        start_date: '2026-04-01',
        cost_rate: 130,
        revenue_rate: 175,
        position: 'Tester Automatyzujący',
        delivery_lead_raw: 'Marcin Kraszewski',
        recruiter_raw: 'Aleksandra Jaczyńska',
    }

    it('new when no existing match', () => {
        expect(classifyRow(row(), undefined)).toBe('new')
    })
    it('unchanged when identical', () => {
        expect(classifyRow(row(), existing)).toBe('unchanged')
    })
    it('updated when a rate changed', () => {
        expect(classifyRow(row({ revenueRate: 185 }), existing)).toBe('updated')
    })

    it('findDisappeared returns existing rows absent from upload', () => {
        const uploaded = [row({ consultantName: 'Inny Konsultant' })]
        const gone = findDisappeared(uploaded, [existing])
        expect(gone).toHaveLength(1)
        expect(gone[0].id).toBe('p1')
    })
})

describe('placementNaturalKey', () => {
    it('is case-insensitive and trims', () => {
        expect(placementNaturalKey('  Adam Sadowski ', 'nordea', '2026-04-01')).toBe(
            placementNaturalKey('adam sadowski', 'NORDEA', '2026-04-01'),
        )
    })
})
