import { describe, expect, it } from 'vitest'
import {
    DB_ROLES,
    canAccessInternalZone,
    canApproveTimesheets,
    canEditNews,
    canManageCompliance,
    canManageInbox,
    canManagerApproveInvoice,
    canReviewInvoices,
    canSubmitOwnInvoice,
    isAdminLike,
    isFinance,
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

describe('canManagerApproveInvoice (Phase 20 — stage 1 manager)', () => {
    it('allows admin and manager', () => {
        expect(canManagerApproveInvoice('admin')).toBe(true)
        expect(canManagerApproveInvoice('manager')).toBe(true)
    })
    it('denies non-manager roles', () => {
        expect(canManagerApproveInvoice('finanse')).toBe(false)
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

describe('canApproveTimesheets (Phase 20)', () => {
    it('allows admin and manager', () => {
        expect(canApproveTimesheets('admin')).toBe(true)
        expect(canApproveTimesheets('manager')).toBe(true)
    })
    it('denies other roles', () => {
        expect(canApproveTimesheets('finanse')).toBe(false)
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
