import { describe, expect, it } from 'vitest'
import {
    DB_ROLES,
    canAccessInternalZone,
    isAdminLike,
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
        expect(isAdminLike(null)).toBe(false)
        expect(isAdminLike(undefined)).toBe(false)
    })
})

describe('isInternalEmployee', () => {
    it('only true for internal', () => {
        expect(isInternalEmployee('internal')).toBe(true)
        expect(isInternalEmployee('admin')).toBe(false)
        expect(isInternalEmployee('consultant')).toBe(false)
    })
})

describe('canAccessInternalZone', () => {
    it('grants access to admins and internal', () => {
        expect(canAccessInternalZone('admin')).toBe(true)
        expect(canAccessInternalZone('internal')).toBe(true)
    })
    it('denies access to consultants', () => {
        expect(canAccessInternalZone('consultant')).toBe(false)
    })
})

describe('DB_ROLES', () => {
    it('matches the migration enum values (Phase 16 + Phase 11a)', () => {
        expect([...DB_ROLES].sort()).toEqual(['admin', 'consultant', 'internal'])
    })
})

describe('roleLabelPl', () => {
    it('returns Polish labels for known roles', () => {
        expect(roleLabelPl('internal')).toBe('Pracownik wewnętrzny')
        expect(roleLabelPl('consultant')).toBe('Konsultant')
        expect(roleLabelPl('admin')).toBe('Admin')
    })
    it('falls back to Nieznana', () => {
        expect(roleLabelPl(null)).toBe('Nieznana')
        expect(roleLabelPl('unknown')).toBe('Nieznana')
    })
})
