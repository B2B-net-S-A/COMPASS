import { describe, expect, it } from 'vitest'
import { addAdminMemberInputSchema, removeAdminMemberInputSchema } from '../admin'

const VALID_UUID = '00000000-0000-4000-8000-000000000001'

describe('addAdminMemberInputSchema', () => {
    it('accepts a valid @b2bnetwork.pl email', () => {
        const r = addAdminMemberInputSchema.safeParse({ email: 'foo@b2bnetwork.pl' })
        expect(r.success).toBe(true)
        if (r.success) expect(r.data.email).toBe('foo@b2bnetwork.pl')
    })

    it('lowercases email', () => {
        const r = addAdminMemberInputSchema.safeParse({ email: 'Foo@B2BNetwork.PL' })
        expect(r.success).toBe(true)
        if (r.success) expect(r.data.email).toBe('foo@b2bnetwork.pl')
    })

    it('trims whitespace', () => {
        const r = addAdminMemberInputSchema.safeParse({ email: '  foo@b2bnetwork.pl  ' })
        expect(r.success).toBe(true)
        if (r.success) expect(r.data.email).toBe('foo@b2bnetwork.pl')
    })

    it('rejects external email domains', () => {
        const r = addAdminMemberInputSchema.safeParse({ email: 'attacker@evil.com' })
        expect(r.success).toBe(false)
    })

    it('rejects malformed emails', () => {
        expect(addAdminMemberInputSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
        expect(addAdminMemberInputSchema.safeParse({ email: '' }).success).toBe(false)
        expect(addAdminMemberInputSchema.safeParse({ email: '@b2bnetwork.pl' }).success).toBe(false)
    })
})

describe('removeAdminMemberInputSchema', () => {
    it('accepts valid UUID', () => {
        expect(removeAdminMemberInputSchema.safeParse({ id: VALID_UUID }).success).toBe(true)
    })

    it('rejects non-UUID', () => {
        expect(removeAdminMemberInputSchema.safeParse({ id: '123' }).success).toBe(false)
        expect(removeAdminMemberInputSchema.safeParse({ id: '' }).success).toBe(false)
    })
})
