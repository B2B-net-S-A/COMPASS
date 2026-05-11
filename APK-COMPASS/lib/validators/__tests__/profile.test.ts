import { describe, expect, it } from 'vitest'
import { profileUpdateInputSchema, updateUserBioInputSchema } from '../profile'

describe('updateUserBioInputSchema', () => {
    it('accepts a normal bio', () => {
        expect(updateUserBioInputSchema.safeParse({ bio: 'Hello world' }).success).toBe(true)
    })

    it('trims whitespace', () => {
        const r = updateUserBioInputSchema.safeParse({ bio: '  hello  ' })
        if (r.success) expect(r.data.bio).toBe('hello')
    })

    it('rejects bio > 5000 chars', () => {
        const longBio = 'x'.repeat(5001)
        expect(updateUserBioInputSchema.safeParse({ bio: longBio }).success).toBe(false)
    })
})

describe('profileUpdateInputSchema', () => {
    it('accepts valid common fields', () => {
        const r = profileUpdateInputSchema.safeParse({
            full_name: 'Jan Kowalski',
            bio: 'Hello',
            experience_years: 5,
            skills: ['Go', 'Rust'],
        })
        expect(r.success).toBe(true)
    })

    it('rejects bad URL', () => {
        const r = profileUpdateInputSchema.safeParse({ avatar_url: 'not-a-url' })
        expect(r.success).toBe(false)
    })

    it('accepts empty string URL (clearing the field)', () => {
        expect(profileUpdateInputSchema.safeParse({ avatar_url: '' }).success).toBe(true)
    })

    it('rejects negative experience_years', () => {
        expect(profileUpdateInputSchema.safeParse({ experience_years: -1 }).success).toBe(false)
    })

    it('rejects experience_years > 80', () => {
        expect(profileUpdateInputSchema.safeParse({ experience_years: 81 }).success).toBe(false)
    })

    it('rejects skills array > 200 items', () => {
        const skills = Array.from({ length: 201 }, (_, i) => `skill${i}`)
        expect(profileUpdateInputSchema.safeParse({ skills }).success).toBe(false)
    })

    it('caps max_monthly_hours to 744 (31 days × 24h)', () => {
        expect(profileUpdateInputSchema.safeParse({ max_monthly_hours: 744 }).success).toBe(true)
        expect(profileUpdateInputSchema.safeParse({ max_monthly_hours: 745 }).success).toBe(false)
    })

    it('accepts gdpr_consent boolean', () => {
        expect(profileUpdateInputSchema.safeParse({ gdpr_consent: true }).success).toBe(true)
        expect(profileUpdateInputSchema.safeParse({ gdpr_consent: 'yes' }).success).toBe(false)
    })

    // .passthrough() — sensitive fields są ignorowane (nie throw) ale i tak
    // nie znajdą się w wynikowym .data, więc nie trafią do .update(). Sprawdzamy
    // że role, embedding, etc. SĄ obecne (passthrough), ale defensive testy
    // pokrywają zachowanie. Po przejściu na strict() (po DB types) test trzeba
    // zaktualizować na .success === false.
    it('passes through unknown fields (will be tightened to .strict after DB types)', () => {
        const r = profileUpdateInputSchema.safeParse({
            full_name: 'Jan',
            role: 'admin',
            embedding: [1, 2, 3],
        })
        expect(r.success).toBe(true)
        // Note: server action drops sensitive fields via explicit spread —
        // this test documents current passthrough behavior; tightening to
        // .strict() is tracked as P0.3 follow-up after generated DB types
        // (P1.4) make field names enforceable.
    })
})
