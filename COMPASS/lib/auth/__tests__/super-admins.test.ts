import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = process.env.SUPER_ADMIN_EMAILS

async function loadModule() {
    vi.resetModules()
    return await import('../super-admins')
}

describe('super-admins', () => {
    beforeEach(() => {
        delete process.env.SUPER_ADMIN_EMAILS
    })

    afterEach(() => {
        if (ORIGINAL_ENV !== undefined) process.env.SUPER_ADMIN_EMAILS = ORIGINAL_ENV
    })

    it('returns empty list when env var is not set', async () => {
        const { getSuperAdmins } = await loadModule()
        expect(getSuperAdmins()).toEqual([])
    })

    it('parses a comma-separated list', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'a@x.com,b@x.com,c@x.com'
        const { getSuperAdmins } = await loadModule()
        expect(getSuperAdmins()).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
    })

    it('lowercases emails for case-insensitive matching', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'AdMin@X.COM, Foo@y.org'
        const { getSuperAdmins } = await loadModule()
        expect(getSuperAdmins()).toEqual(['admin@x.com', 'foo@y.org'])
    })

    it('strips whitespace and ignores empty entries', async () => {
        process.env.SUPER_ADMIN_EMAILS = '  a@x.com  ,, ,b@x.com'
        const { getSuperAdmins } = await loadModule()
        expect(getSuperAdmins()).toEqual(['a@x.com', 'b@x.com'])
    })

    it('caches the parsed list across calls (does not re-parse env)', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'a@x.com'
        const mod = await loadModule()
        const first = mod.getSuperAdmins()
        process.env.SUPER_ADMIN_EMAILS = 'b@y.com'
        const second = mod.getSuperAdmins()
        expect(second).toBe(first)
    })

    describe('isSuperAdmin', () => {
        it('returns false for null/undefined/empty', async () => {
            process.env.SUPER_ADMIN_EMAILS = 'admin@x.com'
            const { isSuperAdmin } = await loadModule()
            expect(isSuperAdmin(null)).toBe(false)
            expect(isSuperAdmin(undefined)).toBe(false)
            expect(isSuperAdmin('')).toBe(false)
        })

        it('returns true for an exact match (case-insensitive)', async () => {
            process.env.SUPER_ADMIN_EMAILS = 'admin@x.com,super@y.com'
            const { isSuperAdmin } = await loadModule()
            expect(isSuperAdmin('admin@x.com')).toBe(true)
            expect(isSuperAdmin('Admin@X.com')).toBe(true)
            expect(isSuperAdmin('SUPER@Y.COM')).toBe(true)
        })

        it('returns false for non-matching email', async () => {
            process.env.SUPER_ADMIN_EMAILS = 'admin@x.com'
            const { isSuperAdmin } = await loadModule()
            expect(isSuperAdmin('user@x.com')).toBe(false)
        })
    })
})
