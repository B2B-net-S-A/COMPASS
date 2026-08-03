import { describe, expect, it } from 'vitest'
import {
    bonusPeriodFromEligibleDate,
    defaultDlBonusReason,
    defaultRecruiterBonusReason,
    placementNaturalKey,
    normalizePersonName,
} from '@/lib/types/placement'

// Phase 28 follow-up — the reason/period helpers back the pre-filled 168h dialog AND the
// server default path. These tests pin the "byte-identical to legacy" guarantee so an
// un-edited form reproduces exactly the bonus text/period generated before the feature.

describe('defaultDlBonusReason', () => {
    it('renders the DL 10%-of-monthly-margin reason with pl-PL grouped amount', () => {
        const reason = defaultDlBonusReason('Marek Cyran', 'BNP Paribas Cardif', 7560)
        // Matches the exact template previously inlined in confirmPlacementHours.
        expect(reason).toBe(
            `Premia DL — placement Marek Cyran @ BNP Paribas Cardif (10% z marży miesięcznej ${(7560).toLocaleString('pl-PL')} zł)`,
        )
        expect(reason).toContain('10% z marży miesięcznej')
    })
})

describe('defaultRecruiterBonusReason', () => {
    it('renders the recruiter reason with tier + margin per hour', () => {
        const reason = defaultRecruiterBonusReason('Marek Cyran', 'BNP Paribas Cardif', 2, 45)
        expect(reason).toBe(
            'Premia rekrutacyjna — placement Marek Cyran @ BNP Paribas Cardif (próg 2, marża 45 zł/h)',
        )
    })
})

describe('bonusPeriodFromEligibleDate', () => {
    it('parses year + month from an ISO eligible date', () => {
        expect(bonusPeriodFromEligibleDate('2026-07-29')).toEqual({ year: 2026, month: 7 })
    })

    it('parses a single-digit month correctly', () => {
        expect(bonusPeriodFromEligibleDate('2026-01-05')).toEqual({ year: 2026, month: 1 })
    })
})

// Guard the natural-key + name helpers that the same module also exports (unchanged, but
// exercised here so a refactor of this file keeps them stable).
describe('placement id helpers', () => {
    it('builds a case-insensitive natural key', () => {
        expect(placementNaturalKey(' Marek Cyran ', 'BNP', '2026-06-30')).toBe(
            'marek cyran|bnp|2026-06-30',
        )
    })

    it('normalizes a person name (trim + collapse whitespace + lowercase)', () => {
        expect(normalizePersonName('  Klaudia   Uliasz ')).toBe('klaudia uliasz')
    })
})
