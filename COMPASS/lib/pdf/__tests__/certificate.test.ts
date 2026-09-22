// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import PDFParser, { type Output } from 'pdf2json'
import { certificateFilename, computeCertificateHash, generateCertificatePdf, type GenerateCertificatePdfArgs } from '../certificate'

const input: GenerateCertificatePdfArgs = {
    fullName: 'Aleksandra Małgorzata Żółć-Świętopełkowska oraz Łukasz Władysław Ćwikliński-Źródełko',
    courseTitle: 'Zaawansowane zarządzanie bezpieczeństwem środowisk Microsoft 365 i odpowiedzialne projektowanie rozwiązań chmurowych: ćwiczenia, współpraca zespołowa oraz wdrażanie odporności organizacyjnej',
    courseAuthorName: 'Łukasz Grzegorz Brzęczyszczykiewicz-Świętopełkowski i Małgorzata Ćwiklińska-Źródełko',
    completedAt: '2026-09-21T23:30:00.000Z',
    certificateHash: 'abcdef0123456789'.repeat(4),
    versionNumber: 12,
    verificationUrl: 'https://compass.example.test/certyfikaty/abcdef0123456789abcdef0123456789',
}

function parse(bytes: Uint8Array): Promise<{ text: string; data: Output }> {
    const parser = new PDFParser(null, true)
    return new Promise((resolve, reject) => {
        parser.on('pdfParser_dataError', error => { parser.destroy(); reject(error) })
        parser.on('pdfParser_dataReady', data => {
            const text = parser.getRawTextContent()
            parser.destroy()
            resolve({ text, data })
        })
        parser.parseBuffer(Buffer.from(bytes))
    })
}

describe('Academy certificate PDF', () => {
    let bytes: Uint8Array
    beforeAll(async () => { bytes = await generateCertificatePdf(input) })

    it('keeps Polish names and titles intact in selectable PDF text', async () => {
        const { text, data } = await parse(bytes)
        const normalized = text.replace(/\s+/g, ' ')
        expect(data.Pages).toHaveLength(1)
        expect(normalized).toContain(input.fullName)
        expect(normalized).toContain(input.courseTitle)
        expect(normalized).toContain(input.courseAuthorName)
        expect(normalized).toContain('Data ukończenia: 22 września 2026')
        expect(normalized).toContain('Wersja programu: 12')
        expect(normalized).toContain(input.certificateHash)
    })

    it('uses the completion instant for creation and modification metadata', async () => {
        const document = await PDFDocument.load(bytes, { updateMetadata: false })
        expect(document.getCreationDate()?.toISOString()).toBe(input.completedAt)
        expect(document.getModificationDate()?.toISOString()).toBe(input.completedAt)
        expect(document.getTitle()).toBe(`Certyfikat ukończenia: ${input.courseTitle}`)
        expect(document.getPages()[0].getSize()).toEqual({ width: 595.28, height: 841.89 })
        expect(await generateCertificatePdf(input)).toEqual(bytes)
    })

    it('wraps long unbroken names, titles and URLs inside the certificate frame', async () => {
        const longName = 'ŻółćŚwiętopełkowski'.repeat(12)
        const longTitle = 'BezpieczeństwoŹródełDanych'.repeat(10)
        const longBytes = await generateCertificatePdf({ ...input, fullName: longName, courseTitle: longTitle, verificationUrl: `https://compass.example.test/${'weryfikacja'.repeat(30)}` })
        const { text, data } = await parse(longBytes)
        expect(text.replace(/\s+/g, '')).toContain(longName)
        expect(text.replace(/\s+/g, '')).toContain(longTitle)
        expect(data.Pages).toHaveLength(1)
        for (const block of data.Pages[0].Texts) {
            // pdf2json x uses (points - 4) / 16; width is in PDF points.
            const left = block.x * 16 + 4
            expect(left).toBeGreaterThanOrEqual(28)
            expect(left + block.w).toBeLessThanOrEqual(595.28 - 28)
            expect(block.y).toBeGreaterThan(1)
            expect(block.y).toBeLessThan(data.Pages[0].Height - 1)
        }
    })

    it('rejects invalid completion data without creating a misleading certificate', async () => {
        await expect(generateCertificatePdf({ ...input, completedAt: 'not-a-date' })).rejects.toThrow('Nieprawidłowa data')
        await expect(generateCertificatePdf({ ...input, fullName: '   ' })).rejects.toThrow('wymaga')
    })

    it('keeps the legacy fingerprint API deterministic', () => {
        expect(computeCertificateHash('user', 'course', input.completedAt)).toMatch(/^[a-f0-9]{64}$/)
        expect(computeCertificateHash('user', 'course', input.completedAt)).toBe(computeCertificateHash('user', 'course', input.completedAt))
        expect(computeCertificateHash('other', 'course', input.completedAt)).not.toBe(computeCertificateHash('user', 'course', input.completedAt))
    })

    it('returns a safe ASCII fallback filename for the existing HTTP header', () => {
        const filename = certificateFilename('Źródła / danych\r\n"', 'Łukasz Żółć')
        expect(filename).toBe('Certyfikat_Zrodla_danych__Lukasz_Zolc.pdf')
        expect(filename).not.toMatch(/[\r\n"/]/)
    })
})
