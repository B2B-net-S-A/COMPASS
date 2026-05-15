import { describe, expect, it } from 'vitest'
import {
    DB_ROLES,
    canAccessInternalZone,
    canReviewInvoices,
    isAdminLike,
    isFinance,
    isInternalEmployee,
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

describe('canReviewInvoices (Phase 19a)', () => {
    it('allows admin and finanse', () => {
        expect(canReviewInvoices('admin')).toBe(true)
        expect(canReviewInvoices('finanse')).toBe(true)
    })
    it('denies non-reviewer roles', () => {
        expect(canReviewInvoices('internal')).toBe(false)
        expect(canReviewInvoices('consultant')).toBe(false)
        expect(canReviewInvoices(null)).toBe(false)
    })
})

describe('canAccessInternalZone', () => {
    it('grants access to admins, internal, and finanse', () => {
        expect(canAccessInternalZone('admin')).toBe(true)
        expect(canAccessInternalZone('internal')).toBe(true)
        expect(canAccessInternalZone('finanse')).toBe(true)
    })
    it('denies access to consultants', () => {
        expect(canAccessInternalZone('consultant')).toBe(false)
    })
})

describe('DB_ROLES', () => {
    it('matches the migration enum values (Phase 16 + Phase 11a + Phase 19a)', () => {
        expect([...DB_ROLES].sort()).toEqual(['admin', 'consultant', 'finanse', 'internal'])
    })
})

describe('roleLabelPl', () => {
    it('returns Polish labels for the 4 Compass roles', () => {
        expect(roleLabelPl('internal')).toBe('Konsultant biurowy')
        expect(roleLabelPl('consultant')).toBe('Konsultant IT')
        expect(roleLabelPl('admin')).toBe('Super Admin')
        expect(roleLabelPl('finanse')).toBe('Finanse')
    })
    it('falls back to Nieznana', () => {
        expect(roleLabelPl(null)).toBe('Nieznana')
        expect(roleLabelPl('unknown')).toBe('Nieznana')
    })
})
