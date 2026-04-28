import { describe, expect, it } from 'vitest'
import { DEFAULT_PERMISSIONS } from '../permissions'

const ROLES = ['recruiter', 'delivery_lead', 'finance', 'consultant'] as const
const FEATURES = [
    'dashboard', 'projects', 'candidates', 'service_hub', 'messages', 'documents',
    'loyalty', 'development', 'import', 'referrals', 'ai_assistant', 'settings', 'rates',
] as const

describe('DEFAULT_PERMISSIONS', () => {
    it('declares an entry for every known role', () => {
        for (const role of ROLES) {
            expect(DEFAULT_PERMISSIONS[role]).toBeDefined()
        }
    })

    it('every role has every feature configured (no missing keys)', () => {
        for (const role of ROLES) {
            for (const feature of FEATURES) {
                expect(DEFAULT_PERMISSIONS[role][feature]).toBeDefined()
            }
        }
    })

    it('uses only valid PermissionValue values', () => {
        const validValues = new Set(['true', 'false', 'portfolio', 'full', 'readonly'])
        for (const role of ROLES) {
            for (const feature of FEATURES) {
                expect(validValues.has(DEFAULT_PERMISSIONS[role][feature])).toBe(true)
            }
        }
    })

    it('consultants do NOT have access to candidates, settings, or import (security expectations)', () => {
        expect(DEFAULT_PERMISSIONS.consultant.candidates).toBe('false')
        expect(DEFAULT_PERMISSIONS.consultant.settings).toBe('false')
        expect(DEFAULT_PERMISSIONS.consultant.import).toBe('false')
    })

    it('all roles have dashboard access (true) — fundamental UX expectation', () => {
        for (const role of ROLES) {
            expect(DEFAULT_PERMISSIONS[role].dashboard).toBe('true')
        }
    })

    it('all roles have ai_assistant access (some level)', () => {
        for (const role of ROLES) {
            expect(['true', 'portfolio', 'full']).toContain(DEFAULT_PERMISSIONS[role].ai_assistant)
        }
    })

    it('recruiter and delivery_lead have portfolio-scoped candidate access', () => {
        expect(DEFAULT_PERMISSIONS.recruiter.candidates).toBe('portfolio')
        expect(DEFAULT_PERMISSIONS.delivery_lead.candidates).toBe('portfolio')
    })
})
