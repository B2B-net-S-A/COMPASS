import { describe, expect, it } from 'vitest'
import {
    OFFICE_CONTACT_EMAIL,
    buildDefaultOofMessages,
    shouldSetOofForLeave,
} from '../oof-template'

// Phase 53 — default OOF templates. 2026-08-20 is a Thursday, 2026-08-21 a Friday.
const BASE = {
    employeeName: 'Jan Kowalski',
    endDate: '2026-08-20',
    returnDate: '2026-08-21',
}

const SUBSTITUTE = {
    substituteName: 'Anna Nowak',
    substituteEmail: 'anna.nowak@b2bnetwork.pl',
}

const MANAGER = {
    managerName: 'Marta Wiśniewska',
    managerEmail: 'marta.wisniewska@b2bnetwork.pl',
}

function enHalf(external: string): string {
    // External is PL + <hr/> + EN; everything after the <hr/> must be English.
    const idx = external.indexOf('<hr/>')
    expect(idx).toBeGreaterThan(-1)
    return external.slice(idx)
}

describe('buildDefaultOofMessages — dates', () => {
    it('states the inclusive end date AND the concrete return date in both replies', () => {
        const { internal, external } = buildDefaultOofMessages({ ...BASE, ...SUBSTITUTE })
        expect(internal).toContain('20 sierpnia 2026')
        expect(internal).toContain('włącznie')
        expect(internal).toContain('21 sierpnia 2026')
        expect(external).toContain('20 sierpnia 2026')
        expect(external).toContain('21 sierpnia 2026')
    })

    it('formats the English half with English month names (old template leaked "sierpnia")', () => {
        const { external } = buildDefaultOofMessages({ ...BASE, ...SUBSTITUTE })
        const en = enHalf(external)
        expect(en).toContain('20 August 2026')
        expect(en).toContain('21 August 2026')
        expect(en).not.toContain('sierpnia')
    })
})

describe('buildDefaultOofMessages — copy constraints', () => {
    it('stays neutral about the absence type and gender (OOF is set for L4 too)', () => {
        const { internal, external } = buildDefaultOofMessages({ ...BASE, ...SUBSTITUTE })
        for (const text of [internal, external]) {
            expect(text).toContain('poza biurem')
            expect(text).not.toContain('nieobecny')
            expect(text).not.toContain('urlopie')
            expect(text).not.toContain('/-a')
        }
    })

    it('keeps person names in the nominative — never "kontakt z Anna Nowak"', () => {
        const { internal, external } = buildDefaultOofMessages({ ...BASE, ...SUBSTITUTE })
        expect(internal).toContain('zastępuje mnie <strong>Anna Nowak</strong>')
        expect(internal).not.toContain('kontakt z Anna')
        expect(external).not.toContain('kontakt z Anna')
    })

    it('internal is Polish-only and short; external carries the bilingual body + company signature', () => {
        const { internal, external } = buildDefaultOofMessages({ ...BASE, ...SUBSTITUTE })
        expect(internal).not.toContain('Hello')
        expect(internal).toContain('— Jan Kowalski')
        expect(external).toContain('Hello')
        expect(external).toContain('Jan Kowalski<br/>B2B Network')
    })
})

describe('buildDefaultOofMessages — urgent-contact fallback chain', () => {
    it('substitute wins when both substitute and manager are provided', () => {
        const { internal, external } = buildDefaultOofMessages({
            ...BASE,
            ...SUBSTITUTE,
            ...MANAGER,
        })
        for (const text of [internal, external]) {
            expect(text).toContain('Anna Nowak')
            expect(text).toContain('mailto:anna.nowak@b2bnetwork.pl')
            expect(text).not.toContain('Marta')
        }
    })

    it('falls back to the manager when no substitute is assigned', () => {
        const { internal, external } = buildDefaultOofMessages({ ...BASE, ...MANAGER })
        expect(internal).toContain('W pilnych sprawach proszę o kontakt: <strong>Marta Wiśniewska</strong>')
        expect(internal).toContain('mailto:marta.wisniewska@b2bnetwork.pl')
        expect(enHalf(external)).toContain('please contact <strong>Marta Wiśniewska</strong>')
    })

    it('falls back to the office mailbox when neither substitute nor manager exists', () => {
        const { internal, external } = buildDefaultOofMessages(BASE)
        expect(internal).toContain(OFFICE_CONTACT_EMAIL)
        expect(internal).toContain('biurem B2B Network')
        expect(enHalf(external)).toContain(OFFICE_CONTACT_EMAIL)
    })

    it('ignores a half-filled substitute (name without email) like the legacy builder did', () => {
        const { internal } = buildDefaultOofMessages({
            ...BASE,
            substituteName: 'Anna Nowak',
            substituteEmail: null,
        })
        expect(internal).not.toContain('Anna Nowak')
        expect(internal).toContain(OFFICE_CONTACT_EMAIL)
    })
})

describe('buildDefaultOofMessages — malformed dates', () => {
    it('falls back to the raw ISO string instead of "undefined" / an Intl throw', () => {
        const { internal, external } = buildDefaultOofMessages({
            ...BASE,
            endDate: '2026-13-05', // passes validateDateString's \d{2} but is no month
            returnDate: '2026-13-06',
        })
        for (const text of [internal, external]) {
            expect(text).toContain('2026-13-05')
            expect(text).not.toContain('undefined')
        }
        expect(enHalf(external)).toContain('2026-13-06')
    })
})

describe('buildDefaultOofMessages — HTML safety', () => {
    it('escapes HTML in interpolated names', () => {
        const { internal } = buildDefaultOofMessages({
            ...BASE,
            employeeName: 'Jan <script>alert(1)</script>',
            substituteName: 'Anna "X" & spółka',
            substituteEmail: 'anna@b2bnetwork.pl',
        })
        expect(internal).not.toContain('<script>')
        expect(internal).toContain('&lt;script&gt;')
        expect(internal).toContain('&quot;X&quot; &amp; spółka')
    })
})

describe('shouldSetOofForLeave', () => {
    it('skips a single-day half-day leave (the employee works part of that day)', () => {
        expect(
            shouldSetOofForLeave({
                startDate: '2026-08-20',
                endDate: '2026-08-20',
                halfDay: 'afternoon',
            }),
        ).toBe(false)
    })

    it('sets OOF for a single-day full-day leave', () => {
        expect(
            shouldSetOofForLeave({
                startDate: '2026-08-20',
                endDate: '2026-08-20',
                halfDay: null,
            }),
        ).toBe(true)
    })

    it('sets OOF for a multi-day leave regardless of a (defensive) half-day flag', () => {
        expect(
            shouldSetOofForLeave({
                startDate: '2026-08-20',
                endDate: '2026-08-24',
                halfDay: 'morning',
            }),
        ).toBe(true)
        expect(
            shouldSetOofForLeave({
                startDate: '2026-08-20',
                endDate: '2026-08-24',
                halfDay: null,
            }),
        ).toBe(true)
    })
})
