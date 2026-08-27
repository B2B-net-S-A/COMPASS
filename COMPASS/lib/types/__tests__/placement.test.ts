import { describe, expect, it } from 'vitest'
import {
    bonusPeriodFromEligibleDate,
    defaultDlBonusReason,
    defaultRecruiterBonusReason,
    placementRecipientBonusSummary,
    placementNaturalKey,
    normalizePersonName,
    type PlacementWithBonusStatus,
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

function buildPlacement(overrides: Partial<PlacementWithBonusStatus> = {}): PlacementWithBonusStatus {
    return {
        id: 'placement-1',
        consultant_name: 'Marcin Szyłko',
        client_name: 'Nordea',
        position: 'Developer',
        start_date: '2026-07-13',
        signing_date: null,
        delivery_lead_id: 'dl-1',
        recruiter_id: 'recruiter-1',
        delivery_lead_raw: 'Delivery Lead',
        recruiter_raw: 'Recruiter',
        cost_rate: 100,
        revenue_rate: 145,
        margin_per_hour: 45,
        monthly_margin: 7560,
        bonus_eligible_date: '2026-08-18',
        dl_bonus_amount: 756,
        recruiter_tier: 2,
        recruiter_bonus_amount: 1500,
        status: 'started',
        hours_confirmed_at: null,
        hours_confirmed_by: null,
        cancelled_at: null,
        cancel_reason: null,
        dl_bonus_id: null,
        additional_dl_bonus_id: null,
        recruiter_bonus_id: null,
        tcm_ticket_id: null,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
        dl_bonus_status: null,
        additional_dl_bonus_status: null,
        recruiter_bonus_status: null,
        dl_bonus_actual_amount: null,
        additional_dl_bonus_actual_amount: null,
        recruiter_bonus_actual_amount: null,
        additional_dl_recipient_id: null,
        additional_dl_recipient_name: null,
        ...overrides,
    }
}

describe('placementRecipientBonusSummary', () => {
    it('shows the full forecast before 168h confirmation', () => {
        expect(placementRecipientBonusSummary(buildPlacement(), 'dl-1')).toMatchObject({
            amount: 756,
            hasNoActiveBonus: false,
        })
        expect(placementRecipientBonusSummary(buildPlacement(), 'recruiter-1')).toMatchObject({
            amount: 1500,
            hasNoActiveBonus: false,
        })
    })

    it('marks a recipient as skipped when their confirmed bonus has no link', () => {
        const placement = buildPlacement({
            status: 'bonus_confirmed',
            dl_bonus_id: null,
            recruiter_bonus_id: 'recruiter-bonus-1',
            recruiter_bonus_status: 'assigned',
            recruiter_bonus_actual_amount: 1600,
        })

        expect(placementRecipientBonusSummary(placement, 'dl-1')).toMatchObject({
            amount: 0,
            hasNoActiveBonus: true,
        })
        expect(placementRecipientBonusSummary(placement, 'recruiter-1')).toMatchObject({
            amount: 1600,
            hasNoActiveBonus: false,
        })
    })

    it('sums only the linked side when one person has both roles', () => {
        const placement = buildPlacement({
            recruiter_id: 'dl-1',
            status: 'bonus_confirmed',
            dl_bonus_id: null,
            recruiter_bonus_id: 'recruiter-bonus-1',
            recruiter_bonus_status: 'assigned',
            recruiter_bonus_actual_amount: 1600,
        })

        expect(placementRecipientBonusSummary(placement, 'dl-1')).toMatchObject({
            isDeliveryLead: true,
            isRecruiter: true,
            amount: 1600,
            hasNoActiveBonus: false,
        })
    })
})
