import { describe, expect, it } from 'vitest'
import {
    ADMIN_DOCS,
    AUTH_DOCS,
    CONSENT_LABELS,
    CONSENT_REQUIRED_CHECKBOXES,
    CURRENT_TERMS_VERSION,
    PUBLIC_DOCS,
} from '../compliance'

describe('compliance constants', () => {
    it('has a non-empty CURRENT_TERMS_VERSION (semver-like string)', () => {
        expect(CURRENT_TERMS_VERSION).toBeTruthy()
        expect(typeof CURRENT_TERMS_VERSION).toBe('string')
    })

    it('declares 4 required consent checkboxes — terms, privacy, data_processing, ai', () => {
        expect(CONSENT_REQUIRED_CHECKBOXES).toEqual(['terms', 'privacy', 'data_processing', 'ai'])
    })

    it('CONSENT_LABELS has a label for every required checkbox', () => {
        for (const key of CONSENT_REQUIRED_CHECKBOXES) {
            expect(CONSENT_LABELS[key]).toBeDefined()
            expect(CONSENT_LABELS[key].text).toBeTruthy()
        }
    })

    it('PUBLIC_DOCS contains the 3 documents shown on the login page footer', () => {
        expect(PUBLIC_DOCS).toEqual(expect.arrayContaining(['privacy-policy', 'terms', 'help']))
    })

    it('AUTH_DOCS and ADMIN_DOCS are non-empty and disjoint from PUBLIC_DOCS', () => {
        expect(AUTH_DOCS.length).toBeGreaterThan(0)
        expect(ADMIN_DOCS.length).toBeGreaterThan(0)
        for (const doc of AUTH_DOCS) {
            expect(PUBLIC_DOCS).not.toContain(doc)
        }
        for (const doc of ADMIN_DOCS) {
            expect(PUBLIC_DOCS).not.toContain(doc)
            expect(AUTH_DOCS).not.toContain(doc)
        }
    })
})
