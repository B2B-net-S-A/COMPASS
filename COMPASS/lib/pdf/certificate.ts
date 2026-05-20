// Phase A1.2: Course completion certificate PDF generator.
//
// A4 portrait, ozdobny layout, podstawowe info (imię, kurs, data, hash).
// Limitation: StandardFonts (Helvetica) nie obsługuje polskich diakrytyków —
// transliterujemy do ASCII (jak timesheet-pdf.ts). TODO: embed TTF via fontkit
// dla pełnych glyfów PL.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createHash } from 'crypto'

export interface GenerateCertificatePdfArgs {
    fullName: string
    courseTitle: string
    courseAuthorName: string | null
    completedAt: string // ISO timestamp
    certificateHash: string
    /** Public verification URL (rendered as text, no QR for MVP). */
    verificationUrl?: string
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89

const PL_TO_ASCII: Record<string, string> = {
    ą: 'a', Ą: 'A', ć: 'c', Ć: 'C', ę: 'e', Ę: 'E',
    ł: 'l', Ł: 'L', ń: 'n', Ń: 'N', ó: 'o', Ó: 'O',
    ś: 's', Ś: 'S', ź: 'z', Ź: 'Z', ż: 'z', Ż: 'Z',
}

function tr(s: string | null | undefined): string {
    if (!s) return ''
    let out = ''
    for (const ch of s) out += PL_TO_ASCII[ch] ?? ch
    return out
}

function fmtDatePl(iso: string): string {
    const d = new Date(iso)
    const months = [
        'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
        'lipca', 'sierpnia', 'wrzesnia', 'pazdziernika', 'listopada', 'grudnia',
    ]
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Deterministic certificate hash — anti-tamper fingerprint.
 * Built from (userId, courseId, completedAt) — stable input,
 * not affected by future PDF regenerations.
 */
export function computeCertificateHash(
    userId: string,
    courseId: string,
    completedAt: string,
): string {
    const canonical = `${userId}|${courseId}|${completedAt}`
    return createHash('sha256').update(canonical).digest('hex')
}

export async function generateCertificatePdf(args: GenerateCertificatePdfArgs): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.setTitle(tr(`Certyfikat ukończenia: ${args.courseTitle}`))
    pdfDoc.setAuthor('COMPASS Akademia')
    pdfDoc.setProducer('COMPASS Akademia LMS')
    pdfDoc.setCreationDate(new Date())

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

    // Tło — delikatny off-white prostokąt z marginesem (efekt karty)
    page.drawRectangle({
        x: 30,
        y: 30,
        width: PAGE_WIDTH - 60,
        height: PAGE_HEIGHT - 60,
        borderColor: rgb(0.85, 0.7, 0.4),
        borderWidth: 3,
    })
    page.drawRectangle({
        x: 38,
        y: 38,
        width: PAGE_WIDTH - 76,
        height: PAGE_HEIGHT - 76,
        borderColor: rgb(0.85, 0.7, 0.4),
        borderWidth: 1,
    })

    // Header — "CERTYFIKAT"
    const headerText = 'CERTYFIKAT'
    const headerSize = 36
    const headerWidth = helveticaBold.widthOfTextAtSize(headerText, headerSize)
    page.drawText(headerText, {
        x: (PAGE_WIDTH - headerWidth) / 2,
        y: PAGE_HEIGHT - 130,
        size: headerSize,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
    })

    const subText = 'ukonczenia szkolenia'
    const subSize = 14
    const subWidth = helvetica.widthOfTextAtSize(subText, subSize)
    page.drawText(subText, {
        x: (PAGE_WIDTH - subWidth) / 2,
        y: PAGE_HEIGHT - 160,
        size: subSize,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
    })

    // Linia ozdobna
    page.drawLine({
        start: { x: 150, y: PAGE_HEIGHT - 185 },
        end: { x: PAGE_WIDTH - 150, y: PAGE_HEIGHT - 185 },
        thickness: 1,
        color: rgb(0.85, 0.7, 0.4),
    })

    // "Niniejszym zaswiadcza sie, ze"
    const intro = 'Niniejszym zaswiadcza sie, ze'
    const introSize = 12
    const introWidth = helvetica.widthOfTextAtSize(intro, introSize)
    page.drawText(intro, {
        x: (PAGE_WIDTH - introWidth) / 2,
        y: PAGE_HEIGHT - 230,
        size: introSize,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
    })

    // Imię i nazwisko (główny element)
    const name = tr(args.fullName).toUpperCase()
    const nameSize = 28
    const nameWidth = helveticaBold.widthOfTextAtSize(name, nameSize)
    page.drawText(name, {
        x: (PAGE_WIDTH - nameWidth) / 2,
        y: PAGE_HEIGHT - 285,
        size: nameSize,
        font: helveticaBold,
        color: rgb(0.1, 0.3, 0.6),
    })

    // "ukoncyl(a) szkolenie"
    const middle = 'ukonczyl(a) szkolenie'
    const middleSize = 12
    const middleWidth = helvetica.widthOfTextAtSize(middle, middleSize)
    page.drawText(middle, {
        x: (PAGE_WIDTH - middleWidth) / 2,
        y: PAGE_HEIGHT - 330,
        size: middleSize,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
    })

    // Tytuł kursu (wyróżniony)
    const courseTitle = tr(args.courseTitle)
    const titleSize = 18
    // Word wrap dla długiego tytułu
    const titleLines = wrapText(courseTitle, helveticaBold, titleSize, PAGE_WIDTH - 200)
    let titleY = PAGE_HEIGHT - 380
    for (const line of titleLines) {
        const w = helveticaBold.widthOfTextAtSize(line, titleSize)
        page.drawText(line, {
            x: (PAGE_WIDTH - w) / 2,
            y: titleY,
            size: titleSize,
            font: helveticaBold,
            color: rgb(0.2, 0.2, 0.2),
        })
        titleY -= titleSize + 4
    }

    // Autor kursu
    if (args.courseAuthorName) {
        const author = `Autor: ${tr(args.courseAuthorName)}`
        const authorSize = 11
        const authorWidth = helvetica.widthOfTextAtSize(author, authorSize)
        page.drawText(author, {
            x: (PAGE_WIDTH - authorWidth) / 2,
            y: titleY - 15,
            size: authorSize,
            font: helveticaOblique,
            color: rgb(0.4, 0.4, 0.4),
        })
        titleY -= 30
    }

    // Data ukończenia
    const dateText = `Data ukonczenia: ${fmtDatePl(args.completedAt)}`
    const dateSize = 12
    const dateWidth = helvetica.widthOfTextAtSize(dateText, dateSize)
    page.drawText(dateText, {
        x: (PAGE_WIDTH - dateWidth) / 2,
        y: titleY - 30,
        size: dateSize,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
    })

    // Stopka — issuer + hash
    const issuerText = 'B2B.net SA - COMPASS Akademia'
    const issuerSize = 11
    const issuerWidth = helveticaBold.widthOfTextAtSize(issuerText, issuerSize)
    page.drawText(issuerText, {
        x: (PAGE_WIDTH - issuerWidth) / 2,
        y: 130,
        size: issuerSize,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
    })

    const hashLabel = `Hash weryfikacyjny: ${args.certificateHash.slice(0, 32)}...`
    const hashSize = 8
    const hashWidth = helvetica.widthOfTextAtSize(hashLabel, hashSize)
    page.drawText(hashLabel, {
        x: (PAGE_WIDTH - hashWidth) / 2,
        y: 95,
        size: hashSize,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
    })

    if (args.verificationUrl) {
        const verifySize = 8
        const verifyWidth = helvetica.widthOfTextAtSize(args.verificationUrl, verifySize)
        page.drawText(args.verificationUrl, {
            x: (PAGE_WIDTH - verifyWidth) / 2,
            y: 78,
            size: verifySize,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
        })
    }

    return await pdfDoc.save()
}

function wrapText(
    text: string,
    font: ReturnType<typeof PDFDocument.prototype.embedFont> extends Promise<infer F> ? F : never,
    size: number,
    maxWidth: number,
): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            current = candidate
        } else {
            if (current) lines.push(current)
            current = word
        }
    }
    if (current) lines.push(current)
    return lines
}

export function certificateFilename(courseTitle: string, fullName: string): string {
    const cleanCourse = tr(courseTitle).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)
    const cleanName = tr(fullName).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)
    return `Certyfikat_${cleanCourse}_${cleanName}.pdf`
}
