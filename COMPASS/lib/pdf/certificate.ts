import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'

export interface GenerateCertificatePdfArgs {
    fullName: string
    courseTitle: string
    courseAuthorName: string | null
    completedAt: string
    certificateHash: string
    versionNumber?: number
    /** Public verification URL (rendered as text). */
    verificationUrl?: string
}

const WIDTH = 595.28
const HEIGHT = 841.89
const TEXT_WIDTH = WIDTH - 128
const INK = rgb(0.13, 0.16, 0.22)
const MUTED = rgb(0.36, 0.40, 0.46)
const ACCENT = rgb(0.30, 0.27, 0.87)
const BORDER = rgb(0.85, 0.87, 0.91)
let fontBytes: Promise<Buffer> | undefined

function certificateFont() {
    // public/ is copied into the standalone deployment; app/fonts/ is not.
    fontBytes ??= readFile(path.join(process.cwd(), 'public/fonts/GeistVF.woff')).catch(error => { fontBytes = undefined; throw error })
    return fontBytes
}

function cleanText(value: string) { return value.normalize('NFC').replace(/\s+/gu, ' ').trim() }

/** Break oversized tokens too, so surnames and verification URLs cannot cross the frame. */
function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = []
    let line = ''
    for (const word of cleanText(text).split(' ')) {
        const combined = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(combined, size) <= width) { line = combined; continue }
        if (line) { lines.push(line); line = '' }
        for (const character of Array.from(word)) {
            if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = '' }
            line += character
        }
    }
    if (line) lines.push(line)
    return lines
}

function drawCentered(page: PDFPage, font: PDFFont, text: string, y: number, size: number, color = INK) {
    page.drawText(text, { x: (WIDTH - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color })
}

function drawFitted(page: PDFPage, font: PDFFont, text: string, box: { top: number; height: number; maxSize: number; minSize: number }, color = INK) {
    if (!text) return
    for (let size = box.maxSize; size >= box.minSize; size -= 0.5) {
        const lines = wrapText(text, font, size, TEXT_WIDTH)
        const leading = size * 1.28
        const height = lines.length * leading
        if (height > box.height) continue
        const firstBaseline = box.top - (box.height - height) / 2 - size
        lines.forEach((line, index) => drawCentered(page, font, line, firstBaseline - index * leading, size, color))
        return
    }
    // Never silently truncate a legal name or render outside the certificate frame.
    throw new Error('Dane certyfikatu są zbyt długie. Sprawdź imię, nazwisko i tytuł szkolenia.')
}

export function computeCertificateHash(userId: string, courseId: string, completedAt: string): string {
    return createHash('sha256').update(`${userId}|${courseId}|${completedAt}`).digest('hex')
}

export async function generateCertificatePdf(args: GenerateCertificatePdfArgs): Promise<Uint8Array> {
    const completed = new Date(args.completedAt)
    if (!Number.isFinite(completed.getTime())) throw new Error('Nieprawidłowa data ukończenia szkolenia.')
    const name = cleanText(args.fullName)
    const title = cleanText(args.courseTitle)
    if (!name || !title) throw new Error('Certyfikat wymaga imienia, nazwiska i tytułu szkolenia.')

    const document = await PDFDocument.create()
    document.registerFontkit(fontkit)
    document.setTitle(`Certyfikat ukończenia: ${title}`)
    document.setSubject(`Ukończenie szkolenia${args.versionNumber ? ` - wersja ${args.versionNumber}` : ''}`)
    document.setAuthor('COMPASS Akademia')
    document.setCreator('COMPASS Akademia')
    document.setProducer('COMPASS Akademia LMS')
    document.setCreationDate(completed)
    document.setModificationDate(completed)
    document.setLanguage('pl-PL')
    const font = await document.embedFont(await certificateFont(), { subset: true })
    const page = document.addPage([WIDTH, HEIGHT])

    page.drawRectangle({ x: 28, y: 28, width: WIDTH - 56, height: HEIGHT - 56, borderColor: BORDER, borderWidth: 1 })
    page.drawRectangle({ x: 48, y: HEIGHT - 59, width: 48, height: 4, color: ACCENT })
    page.drawText('COMPASS / AKADEMIA', { x: 48, y: HEIGHT - 84, font, size: 10, color: MUTED })
    drawCentered(page, font, 'CERTYFIKAT', 695, 36)
    drawCentered(page, font, 'ukończenia szkolenia', 666, 14, MUTED)
    page.drawLine({ start: { x: 225, y: 637 }, end: { x: WIDTH - 225, y: 637 }, thickness: 2, color: ACCENT })
    drawCentered(page, font, 'Potwierdzamy, że', 605, 11, MUTED)
    drawFitted(page, font, name, { top: 584, height: 104, maxSize: 28, minSize: 11 }, ACCENT)
    drawCentered(page, font, 'ukończył(a) szkolenie', 460, 11, MUTED)
    drawFitted(page, font, title, { top: 436, height: 134, maxSize: 23, minSize: 11 })
    if (args.courseAuthorName) drawFitted(page, font, `Autor szkolenia: ${cleanText(args.courseAuthorName)}`, { top: 281, height: 50, maxSize: 11, minSize: 8 }, MUTED)

    const date = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(completed)
    drawCentered(page, font, `Data ukończenia: ${date}`, 208, 11)
    if (args.versionNumber !== undefined) drawCentered(page, font, `Wersja programu: ${args.versionNumber}`, 188, 10, MUTED)
    page.drawLine({ start: { x: 64, y: 168 }, end: { x: WIDTH - 64, y: 168 }, thickness: 0.75, color: BORDER })
    drawCentered(page, font, 'B2B.net SA - COMPASS Akademia', 145, 11)
    drawCentered(page, font, 'Identyfikator certyfikatu', 121, 8, MUTED)
    drawFitted(page, font, args.certificateHash, { top: 114, height: 22, maxSize: 8, minSize: 6 }, MUTED)
    if (args.verificationUrl) drawFitted(page, font, args.verificationUrl, { top: 86, height: 41, maxSize: 8, minSize: 6 }, MUTED)

    return document.save()
}

/** ASCII filename for the existing Content-Disposition header; PDF content remains Unicode. */
export function certificateFilename(courseTitle: string, fullName: string): string {
    const safe = (value: string, length: number) => value.replace(/[łŁ]/g, letter => letter === 'ł' ? 'l' : 'L').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, length)
    return `Certyfikat_${safe(courseTitle, 40)}_${safe(fullName, 30)}.pdf`
}
