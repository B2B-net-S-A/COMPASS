import { describe, it, expect } from 'vitest'
import { safeExternalUrl } from '../safe-url'

describe('safeExternalUrl', () => {
    it('przepuszcza http i https', () => {
        expect(safeExternalUrl('https://www.pip.gov.pl/aktualnosci')).toBe(
            'https://www.pip.gov.pl/aktualnosci',
        )
        expect(safeExternalUrl('http://example.org/a?b=1#c')).toBe('http://example.org/a?b=1#c')
    })

    it('odrzuca javascript: — także z wiodącą spacją i mieszaną wielkością liter', () => {
        expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
        expect(safeExternalUrl('  javascript:alert(1)')).toBeNull()
        expect(safeExternalUrl('JaVaScRiPt:alert(1)')).toBeNull()
    })

    it('odrzuca pozostałe schematy wykonywalne i osadzone treści', () => {
        expect(safeExternalUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
        expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull()
        expect(safeExternalUrl('file:///etc/passwd')).toBeNull()
    })

    it('odrzuca puste i niepoprawne wejście', () => {
        expect(safeExternalUrl(null)).toBeNull()
        expect(safeExternalUrl(undefined)).toBeNull()
        expect(safeExternalUrl('')).toBeNull()
        expect(safeExternalUrl('   ')).toBeNull()
        expect(safeExternalUrl('www.pip.gov.pl/bez-schematu')).toBeNull()
    })
})
