import { describe, expect, it } from 'vitest'

import { wrapHrEmail } from '@/lib/email'

/**
 * Audyt 2026-08: `lib/email.ts` to 40 szablonów i ani jednego testu, a `escapeHtml`
 * była używana wyłącznie w szablonach monitoringu prawnego. Nagłówek maila
 * powstaje z tematu, a temat sklejamy z imienia i nazwiska albo tytułu ogłoszenia,
 * czyli z tekstem wpisanym przez człowieka.
 */
describe('wrapHrEmail — nagłówek i eyebrow nie wpuszczają HTML-a', () => {
    it('escapuje znaczniki w nagłówku', () => {
        const html = wrapHrEmail({
            tag: 'Ogłoszenie',
            heading: 'Nowy wniosek — <img src=x onerror="alert(1)">',
            bodyHtml: '<p>treść</p>',
        })
        expect(html).not.toContain('<img src=x')
        expect(html).toContain('&lt;img src=x')
    })

    it('escapuje eyebrow (tag)', () => {
        const html = wrapHrEmail({ tag: '<b>tag</b>', heading: 'Temat', bodyHtml: '' })
        expect(html).not.toContain('<b>tag</b>')
        expect(html).toContain('&lt;b&gt;tag&lt;/b&gt;')
    })

    it('preheader też jest escapowany', () => {
        const html = wrapHrEmail({ tag: 'T', heading: 'A & B "cytat"', bodyHtml: '' })
        expect(html).toContain('A &amp; B &quot;cytat&quot;')
    })

    it('nadal ścina prefiks [COMPASS …] z tematu', () => {
        const html = wrapHrEmail({ tag: 'T', heading: '[COMPASS HR] Nowy wniosek', bodyHtml: '' })
        expect(html).toContain('>Nowy wniosek</h1>')
    })

    it('bodyHtml zostaje HTML-em — szablony budują go świadomie', () => {
        const html = wrapHrEmail({ tag: 'T', heading: 'H', bodyHtml: '<ul><li>pozycja</li></ul>' })
        expect(html).toContain('<ul><li>pozycja</li></ul>')
    })
})
