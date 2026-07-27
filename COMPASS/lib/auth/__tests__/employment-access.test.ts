import { describe, expect, it } from 'vitest'

import {
    ARCHIVED_ACCOUNT_ERROR_CODE,
    ARCHIVED_ACCOUNT_MESSAGE_PL,
    isArchivedAccount,
} from '@/lib/auth/employment-access'

describe('isArchivedAccount', () => {
    it('blocks an archived employee', () => {
        expect(isArchivedAccount('exited')).toBe(true)
    })

    it('lets an active employee through', () => {
        expect(isArchivedAccount('active')).toBe(false)
    })

    it('lets an offboarding employee through', () => {
        // Do ostatniego dnia normalnie pracuje — i musi jeszcze móc wypełnić
        // exit interview, który jest częścią offboardingu.
        expect(isArchivedAccount('offboarding')).toBe(false)
    })

    it('lets someone mid-onboarding through', () => {
        expect(isArchivedAccount('onboarding')).toBe(false)
    })

    it('does not block when the status is missing', () => {
        // Brak profilu / brak kolumny nie może wylogować całej firmy —
        // blokuje wyłącznie jawny `exited`.
        expect(isArchivedAccount(null)).toBe(false)
        expect(isArchivedAccount(undefined)).toBe(false)
        expect(isArchivedAccount('')).toBe(false)
    })

    it('does not block on an unknown status', () => {
        expect(isArchivedAccount('pending')).toBe(false)
        expect(isArchivedAccount('whatever')).toBe(false)
    })

    it('is case-sensitive against the DB enum', () => {
        // W bazie jest wyłącznie lowercase; luźniejsze dopasowanie tylko
        // rozmywałoby regułę.
        expect(isArchivedAccount('EXITED')).toBe(false)
    })
})

describe('shared constants', () => {
    it('exposes the error code used in /login?error=', () => {
        expect(ARCHIVED_ACCOUNT_ERROR_CODE).toBe('account_archived')
    })

    it('tells the person where to go instead of looking like a failure', () => {
        expect(ARCHIVED_ACCOUNT_MESSAGE_PL).toContain('HR')
    })
})
