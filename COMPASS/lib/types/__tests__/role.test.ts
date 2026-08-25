import { describe, expect, it } from 'vitest'
import {
    DB_ROLES,
    HR_ZONE_ROLES,
    canAccessInternalZone,
    canApproveTimesheets,
    canEditNews,
    canManageCompliance,
    canManageInbox,
    canManageLifecycle,
    canManagerApproveInvoice,
    canProposeBonus,
    canReadAllBonuses,
    canReviewInvoices,
    canSubmitOwnInvoice,
    isAdminLike,
    isFinance,
    isHrZoneRole,
    isInternalEmployee,
    isManager,
    isTalentCommunity,
    roleLabelPl,
} from '../role'

describe('isAdminLike', () => {
    it('returns true for admin', () => {
        expect(isAdminLike('admin')).toBe(true)
    })
    it('returns false for non-admin roles', () => {
        expect(isAdminLike('consultant')).toBe(false)
        expect(isAdminLike('internal')).toBe(false)
        expect(isAdminLike('finanse')).toBe(false)
        expect(isAdminLike('manager')).toBe(false)
        expect(isAdminLike('talent_community')).toBe(false)
        expect(isAdminLike(null)).toBe(false)
        expect(isAdminLike(undefined)).toBe(false)
    })
})

describe('isInternalEmployee', () => {
    it('only true for internal', () => {
        expect(isInternalEmployee('internal')).toBe(true)
        expect(isInternalEmployee('admin')).toBe(false)
        expect(isInternalEmployee('consultant')).toBe(false)
        expect(isInternalEmployee('finanse')).toBe(false)
        expect(isInternalEmployee('manager')).toBe(false)
        expect(isInternalEmployee('talent_community')).toBe(false)
    })
})

describe('isFinance (Phase 19a)', () => {
    it('only true for finanse', () => {
        expect(isFinance('finanse')).toBe(true)
        expect(isFinance('admin')).toBe(false)
        expect(isFinance('internal')).toBe(false)
        expect(isFinance('consultant')).toBe(false)
        expect(isFinance(null)).toBe(false)
    })
})

describe('isManager (Phase 20)', () => {
    it('only true for manager', () => {
        expect(isManager('manager')).toBe(true)
        expect(isManager('admin')).toBe(false)
        expect(isManager('internal')).toBe(false)
        expect(isManager('finanse')).toBe(false)
        expect(isManager('consultant')).toBe(false)
        expect(isManager(null)).toBe(false)
    })
})

describe('isTalentCommunity (Phase 20)', () => {
    it('only true for talent_community', () => {
        expect(isTalentCommunity('talent_community')).toBe(true)
        expect(isTalentCommunity('admin')).toBe(false)
        expect(isTalentCommunity('internal')).toBe(false)
        expect(isTalentCommunity('finanse')).toBe(false)
        expect(isTalentCommunity('manager')).toBe(false)
        expect(isTalentCommunity('consultant')).toBe(false)
    })
})

describe('canReviewInvoices (Phase 19a — stage 2 finanse)', () => {
    it('allows admin and finanse', () => {
        expect(canReviewInvoices('admin')).toBe(true)
        expect(canReviewInvoices('finanse')).toBe(true)
    })
    it('denies non-reviewer roles', () => {
        expect(canReviewInvoices('internal')).toBe(false)
        expect(canReviewInvoices('consultant')).toBe(false)
        expect(canReviewInvoices('manager')).toBe(false)
        expect(canReviewInvoices('talent_community')).toBe(false)
        expect(canReviewInvoices(null)).toBe(false)
    })
})

describe('canManagerApproveInvoice (Phase 20 + 20e — stage 1)', () => {
    it('allows admin, manager, and finanse (team manager via manager_id link)', () => {
        expect(canManagerApproveInvoice('admin')).toBe(true)
        expect(canManagerApproveInvoice('manager')).toBe(true)
        expect(canManagerApproveInvoice('finanse')).toBe(true)
    })
    it('denies other roles', () => {
        expect(canManagerApproveInvoice('internal')).toBe(false)
        expect(canManagerApproveInvoice('consultant')).toBe(false)
        expect(canManagerApproveInvoice('talent_community')).toBe(false)
        expect(canManagerApproveInvoice(null)).toBe(false)
    })
})

describe('canAccessInternalZone (Phase 20: 5 HR-zone roles)', () => {
    it('grants access to all HR-zone roles', () => {
        expect(canAccessInternalZone('admin')).toBe(true)
        expect(canAccessInternalZone('internal')).toBe(true)
        expect(canAccessInternalZone('finanse')).toBe(true)
        expect(canAccessInternalZone('manager')).toBe(true)
        expect(canAccessInternalZone('talent_community')).toBe(true)
    })
    it('denies access to consultants (IT)', () => {
        expect(canAccessInternalZone('consultant')).toBe(false)
    })
})

describe('canApproveTimesheets (Phase 20 + 20e)', () => {
    it('allows admin, manager, and finanse (team manager via manager_id)', () => {
        expect(canApproveTimesheets('admin')).toBe(true)
        expect(canApproveTimesheets('manager')).toBe(true)
        expect(canApproveTimesheets('finanse')).toBe(true)
    })
    it('denies other roles', () => {
        expect(canApproveTimesheets('internal')).toBe(false)
        expect(canApproveTimesheets('talent_community')).toBe(false)
        expect(canApproveTimesheets('consultant')).toBe(false)
    })
})

describe('canManageInbox / canEditNews / canManageCompliance (Phase 20 TCM)', () => {
    it('allow admin and talent_community', () => {
        expect(canManageInbox('admin')).toBe(true)
        expect(canManageInbox('talent_community')).toBe(true)
        expect(canEditNews('admin')).toBe(true)
        expect(canEditNews('talent_community')).toBe(true)
        expect(canManageCompliance('admin')).toBe(true)
        expect(canManageCompliance('talent_community')).toBe(true)
    })
    it('deny other roles', () => {
        for (const role of ['consultant', 'internal', 'finanse', 'manager'] as const) {
            expect(canManageInbox(role)).toBe(false)
            expect(canEditNews(role)).toBe(false)
            expect(canManageCompliance(role)).toBe(false)
        }
    })
})

describe('canSubmitOwnInvoice (Phase 20)', () => {
    it('allows all HR-zone roles (Konsultant IT excluded)', () => {
        expect(canSubmitOwnInvoice('admin')).toBe(true)
        expect(canSubmitOwnInvoice('internal')).toBe(true)
        expect(canSubmitOwnInvoice('finanse')).toBe(true)
        expect(canSubmitOwnInvoice('manager')).toBe(true)
        expect(canSubmitOwnInvoice('talent_community')).toBe(true)
    })
    it('denies consultant IT', () => {
        expect(canSubmitOwnInvoice('consultant')).toBe(false)
    })
})

// Audyt 2026-08-25: trzy reguły autoryzacji były jedynymi predykatami w tym
// pliku bez testu — w tym `canProposeBonus`, czyli jedyne miejsce mówiące, kto
// w ogóle może przyznać premię.

describe('canProposeBonus (Phase 22/26)', () => {
    it('allows admin and manager', () => {
        expect(canProposeBonus('admin')).toBe(true)
        expect(canProposeBonus('manager')).toBe(true)
    })
    it('denies everyone else (scope zespołu i tak sprawdza akcja + RLS)', () => {
        expect(canProposeBonus('finanse')).toBe(false)
        expect(canProposeBonus('internal')).toBe(false)
        expect(canProposeBonus('talent_community')).toBe(false)
        expect(canProposeBonus('consultant')).toBe(false)
        expect(canProposeBonus(null)).toBe(false)
        expect(canProposeBonus(undefined)).toBe(false)
    })
})

describe('canReadAllBonuses (Phase 22)', () => {
    it('allows admin and finanse', () => {
        expect(canReadAllBonuses('admin')).toBe(true)
        expect(canReadAllBonuses('finanse')).toBe(true)
    })
    it('denies manager (widzi tylko swój zespół przez RLS) and the rest', () => {
        expect(canReadAllBonuses('manager')).toBe(false)
        expect(canReadAllBonuses('internal')).toBe(false)
        expect(canReadAllBonuses('talent_community')).toBe(false)
        expect(canReadAllBonuses('consultant')).toBe(false)
        expect(canReadAllBonuses(null)).toBe(false)
    })
})

describe('canManageLifecycle (Phase 22)', () => {
    it('allows admin and talent_community', () => {
        expect(canManageLifecycle('admin')).toBe(true)
        expect(canManageLifecycle('talent_community')).toBe(true)
    })
    it('denies the remaining roles', () => {
        expect(canManageLifecycle('manager')).toBe(false)
        expect(canManageLifecycle('finanse')).toBe(false)
        expect(canManageLifecycle('internal')).toBe(false)
        expect(canManageLifecycle('consultant')).toBe(false)
        expect(canManageLifecycle(null)).toBe(false)
    })
})

describe('isHrZoneRole / HR_ZONE_ROLES', () => {
    it('covers every role except Konsultant IT', () => {
        expect([...HR_ZONE_ROLES].sort()).toEqual([
            'admin',
            'finanse',
            'internal',
            'manager',
            'talent_community',
        ])
        for (const role of HR_ZONE_ROLES) {
            expect(isHrZoneRole(role)).toBe(true)
        }
    })
    it('excludes consultant and unknown values', () => {
        expect(isHrZoneRole('consultant')).toBe(false)
        expect(isHrZoneRole('root')).toBe(false)
        expect(isHrZoneRole(null)).toBe(false)
        expect(isHrZoneRole(undefined)).toBe(false)
    })
    it('stays in sync with canAccessInternalZone', () => {
        for (const role of DB_ROLES) {
            expect(isHrZoneRole(role)).toBe(canAccessInternalZone(role))
        }
    })
})

describe('DB_ROLES', () => {
    it('matches the migration enum values (Phase 16 + 11a + 19a + 20)', () => {
        expect([...DB_ROLES].sort()).toEqual([
            'admin',
            'consultant',
            'finanse',
            'internal',
            'manager',
            'talent_community',
        ])
    })
})

describe('roleLabelPl', () => {
    it('returns Polish labels for the 6 Compass roles', () => {
        expect(roleLabelPl('admin')).toBe('Super Admin')
        expect(roleLabelPl('consultant')).toBe('Konsultant IT')
        expect(roleLabelPl('internal')).toBe('Konsultant wewnętrzny')
        expect(roleLabelPl('finanse')).toBe('Finanse')
        expect(roleLabelPl('manager')).toBe('Manager')
        expect(roleLabelPl('talent_community')).toBe('Talent Community Manager')
    })
    it('falls back to Nieznana', () => {
        expect(roleLabelPl(null)).toBe('Nieznana')
        expect(roleLabelPl('unknown')).toBe('Nieznana')
    })
})
