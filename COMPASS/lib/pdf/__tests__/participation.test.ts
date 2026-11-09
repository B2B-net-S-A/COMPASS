// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { certificateFilename, generateParticipationPdf, participationFilename, VENDOR_DISCLAIMER } from '../certificate'

const input = { fullName: 'Łukasz Żółć', courseTitle: 'Bezpieczeństwo DORA', runTitle: 'Edycja listopad', issuedAt: '2026-11-09T10:00:00.000Z', documentCode: 'abcdef0123456789'.repeat(4), versionNumber: 2 }

describe('zaświadczenie udziału', () => {
    it('jest osobnym dokumentem z tytułem zaświadczenia', async () => {
        const document = await PDFDocument.load(await generateParticipationPdf(input))
        expect(document.getTitle()).toBe('Zaświadczenie udziału: Bezpieczeństwo DORA')
        expect(document.getPageCount()).toBe(1)
    })

    it('odrzuca pustą datę i puste nazwisko', async () => {
        await expect(generateParticipationPdf({ ...input, issuedAt: 'x' })).rejects.toThrow('Nieprawidłowa data')
        await expect(generateParticipationPdf({ ...input, fullName: '  ' })).rejects.toThrow('imienia')
    })

    it('ma inną nazwę pliku niż certyfikat', () => {
        expect(participationFilename('Kurs', 'Jan Nowak')).toMatch(/^Zaswiadczenie_/)
        expect(certificateFilename('Kurs', 'Jan Nowak')).toMatch(/^Certyfikat_/)
    })

    it('dopisek mówi o braku związku z certyfikacją producenta', () => {
        expect(VENDOR_DISCLAIMER).toContain('producenta')
    })
})
