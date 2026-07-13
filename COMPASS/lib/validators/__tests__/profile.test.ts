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

    it('rejects privileged and unknown fields', () => {
        const r = profileUpdateInputSchema.safeParse({
            full_name: 'Jan',
            role: 'admin',
            embedding: [1, 2, 3],
        })
        expect(r.success).toBe(false)
    })

    it.each([
        'avatar_url',
        'cv_url',
        'gdpr_consent',
        'max_monthly_hours',
        'current_status',
        'employment_status',
        'loyalty_points',
        'onboarding_completed',
    ])('%s can only be changed by a dedicated action', (field) => {
        expect(profileUpdateInputSchema.safeParse({ [field]: 'attacker-controlled' }).success).toBe(false)
    })
})
