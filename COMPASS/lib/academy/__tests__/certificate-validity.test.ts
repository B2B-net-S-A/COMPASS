import { describe, expect, it } from 'vitest'
import { certificateValidity, certificateValidityLabel } from '../certificate-validity'

const now = Date.parse('2027-06-01T12:00:00Z')
const days = (n: number) => new Date(now + n * 86_400_000).toISOString()

describe('certificateValidity', () => {
    it('treats a snapshot without a date as an unlimited document', () => {
        expect(certificateValidity({}, null, now)).toEqual({ state: 'unlimited', validUntil: null })
        expect(certificateValidity({ valid_until: null }, null, now).state).toBe('unlimited')
        expect(certificateValidity(null, null, now).state).toBe('unlimited')
    })

    it('does not read a malformed date as an expiry', () => {
        expect(certificateValidity({ valid_until: 'wkrótce' }, null, now).state).toBe('unlimited')
    })

    it('separates valid, expiring and expired at the boundaries', () => {
        expect(certificateValidity({ valid_until: days(31) }, null, now).state).toBe('valid')
        expect(certificateValidity({ valid_until: days(30) }, null, now).state).toBe('expiring')
        expect(certificateValidity({ valid_until: days(0) }, null, now).state).toBe('expired')
        expect(certificateValidity({ valid_until: days(-1) }, null, now).state).toBe('expired')
    })

    it('lets revocation win over any date', () => {
        expect(certificateValidity({ valid_until: days(100) }, days(-1), now).state).toBe('revoked')
    })
})

describe('certificateValidityLabel', () => {
    it('names the state and the date in Polish', () => {
        expect(certificateValidityLabel({ state: 'unlimited', validUntil: null })).toBe('Bezterminowy')
        expect(certificateValidityLabel({ state: 'revoked', validUntil: days(10) })).toBe('Unieważniony')
        expect(certificateValidityLabel({ state: 'valid', validUntil: '2027-06-20T12:00:00Z' })).toBe('Ważny do 20 czerwca 2027')
        expect(certificateValidityLabel({ state: 'expired', validUntil: '2027-05-20T12:00:00Z' })).toBe('Wygasł 20 maja 2027')
    })
})
