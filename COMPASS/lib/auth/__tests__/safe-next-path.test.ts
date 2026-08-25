import { describe, expect, it } from 'vitest'
import { safeNextPath } from '../safe-next-path'

// Audyt 2026-08 (A0.3): `?next=` był doklejany do originu interpolacją stringa,
// więc dało się przenieść przeglądarkę na obcy host linkiem, który wygląda
// jak firmowy. Gałąź redirectu działa też bez parametru `code`, czyli bez
// jakiegokolwiek logowania — dlatego to był open redirect dla każdego.
describe('safeNextPath', () => {
    const FALLBACK = '/home'

    it('przepuszcza zwykłą ścieżkę względną', () => {
        expect(safeNextPath('/internal', FALLBACK)).toBe('/internal')
        expect(safeNextPath('/onboarding?step=2', FALLBACK)).toBe('/onboarding?step=2')
    })

    it('używa fallbacku, gdy parametru nie ma', () => {
        expect(safeNextPath(null, FALLBACK)).toBe(FALLBACK)
        expect(safeNextPath('', FALLBACK)).toBe(FALLBACK)
    })

    it('odrzuca userinfo-hijack — realny wektor z audytu', () => {
        // `${origin}@evil.com` → przeglądarka czyta origin jako userinfo,
        // a hostem staje się evil.com.
        expect(safeNextPath('@evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeNextPath('.evil.com', FALLBACK)).toBe(FALLBACK)
    })

    it('odrzuca protocol-relative URL', () => {
        expect(safeNextPath('//evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeNextPath('//evil.com/phish', FALLBACK)).toBe(FALLBACK)
    })

    it('odrzuca absolutny URL na obcy host', () => {
        expect(safeNextPath('https://evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeNextPath('http://evil.com', FALLBACK)).toBe(FALLBACK)
    })

    it('odrzuca backslash — niektóre przeglądarki traktują go jak ukośnik', () => {
        expect(safeNextPath('/\\evil.com', FALLBACK)).toBe(FALLBACK)
        expect(safeNextPath('/path\\..\\evil', FALLBACK)).toBe(FALLBACK)
    })
})
