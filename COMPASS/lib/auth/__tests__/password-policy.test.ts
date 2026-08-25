import { describe, expect, it } from 'vitest'

import { PASSWORD_MIN_LENGTH, isPasswordStrongEnough } from '@/lib/auth/password-policy'

/**
 * Reguła była zapisana tylko w rejestracji, a samoobsługowy reset hasła miał
 * własną, słabszą (minLength=6). Test pilnuje, że obie ścieżki mówią to samo.
 */
describe('polityka haseł', () => {
    it('przyjmuje hasło spełniające regułę', () => {
        expect(isPasswordStrongEnough('Poprawne123')).toBe(true)
    })

    it('odrzuca za krótkie, mimo wielkiej litery i cyfry', () => {
        expect(isPasswordStrongEnough('Krotkie1')).toBe(false)
        expect(PASSWORD_MIN_LENGTH).toBe(10)
    })

    it('odrzuca brak wielkiej litery i brak cyfry', () => {
        expect(isPasswordStrongEnough('samemalelitery1')).toBe(false)
        expect(isPasswordStrongEnough('SameLiteryBezCyfry')).toBe(false)
    })

    it('odrzuca hasło, które przechodziło przez stary reset (6 znaków)', () => {
        expect(isPasswordStrongEnough('abc123')).toBe(false)
    })
})
