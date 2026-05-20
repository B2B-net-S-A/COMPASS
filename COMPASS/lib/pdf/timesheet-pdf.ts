// Phase 11: Timesheet PDF generator using pdf-lib (already in deps).
//
// Limitation: StandardFonts (Helvetica) do not support Polish diacritics.
// We transliterate to ASCII (ą→a, ć→c, …) so labels render correctly. To get
// proper Polish glyphs later, embed a TTF via @pdf-lib/fontkit (TODO Phase 12).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface TimesheetEntryForPdf {
    work_date: string
    hours: number | string
    project: string | null
    description: string
}

export interface TimesheetForPdf {
    year: number
    month: number
    pdf_hash: string | null
    approved_at: string | null
}

export interface ProfileForPdf {
    full_name: string | null
    email: string
    employment_type: 'uop' | 'b2b' | null
    work_start_date: string | null
}

export interface GenerateTimesheetPdfArgs {
    timesheet: TimesheetForPdf
    entries: TimesheetEntryForPdf[]
    profile: ProfileForPdf
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 50

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

const MONTH_PL = [
    '', 'styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec',
    'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien',
]

const WEEKDAY_PL_SHORT = ['Nd', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'So']

function fmtDateShort(iso: string): { day: string; weekday: string } {
    const d = new Date(iso + 'T00:00:00Z')
    return {
        day: `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        weekday: WEEKDAY_PL_SHORT[d.getUTCDay()],
    }
}

function formatHours(h: number | string): string {
    return Number(h).toFixed(2)
}

export async function generateTimesheetPdf(args: GenerateTimesheetPdfArgs): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.setTitle(
        tr(`Karta pracy ${args.profile.full_name ?? args.profile.email} ${args.timesheet.year}-${String(args.timesheet.month).padStart(2, '0')}`),
    )
    pdfDoc.setAuthor('COMPASS')
    pdfDoc.setProducer('COMPASS HR Internal')
    pdfDoc.setCreationDate(new Date())

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let y = PAGE_HEIGHT - MARGIN

    // ─── Header ────────────────────────────────────────────────────────────
    page.drawText('KARTA PRACY / TIMESHEET', {
        x: MARGIN,
        y: y - 18,
        size: 18,
        font: helveticaBold,
        color: rgb(0.04, 0.3, 0.43), // brand-ish teal
    })
    y -= 30
    page.drawText(
        tr(`${MONTH_PL[args.timesheet.month]} ${args.timesheet.year}`),
        {
            x: MARGIN,
            y: y - 14,
            size: 14,
            font: helvetica,
            color: rgb(0.3, 0.3, 0.3),
        },
    )
    y -= 35

    // Horizontal rule
    page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
    })
    y -= 15

    // ─── Meta block ────────────────────────────────────────────────────────
    const totalHours = args.entries.reduce((sum, e) => sum + Number(e.hours), 0)
    const meta: Array<[string, string]> = [
        ['Pracownik', tr(args.profile.full_name ?? '') || tr(args.profile.email)],
        ['Email', tr(args.profile.email)],
        ['Typ umowy', args.profile.employment_type === 'b2b' ? 'B2B' : 'UoP (umowa o prace)'],
    ]
    if (args.profile.work_start_date) {
        meta.push(['Data rozpoczecia', args.profile.work_start_date])
    }
    meta.push([
        'Liczba wpisow',
        `${args.entries.length}`,
    ])
    meta.push([
        'Suma godzin',
        formatHours(totalHours) + ' h',
    ])

    for (const [k, v] of meta) {
        page.drawText(`${tr(k)}:`, { x: MARGIN, y: y - 11, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
        page.drawText(v, { x: MARGIN + 110, y: y - 11, size: 10, font: helvetica, color: rgb(0, 0, 0) })
        y -= 14
    }

    y -= 10
    page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
    })
    y -= 18

    // ─── Entries table ─────────────────────────────────────────────────────
    const cols = {
        date: { x: MARGIN, w: 60, label: 'Data' },
        weekday: { x: MARGIN + 65, w: 25, label: 'Dzien' },
        project: { x: MARGIN + 95, w: 110, label: 'Projekt' },
        description: { x: MARGIN + 210, w: 220, label: 'Opis' },
        hours: { x: MARGIN + 435, w: 60, label: 'Godziny' },
    }

    function drawTableHeader() {
        for (const c of Object.values(cols)) {
            page.drawText(tr(c.label), {
                x: c.x,
                y: y - 10,
                size: 9,
                font: helveticaBold,
                color: rgb(0.2, 0.2, 0.2),
            })
        }
        y -= 13
        page.drawLine({
            start: { x: MARGIN, y },
            end: { x: PAGE_WIDTH - MARGIN, y },
            thickness: 0.5,
            color: rgb(0.5, 0.5, 0.5),
        })
        y -= 8
    }
    drawTableHeader()

    function ensureRoomForRow(): boolean {
        const FOOTER_RESERVED = 130
        if (y < MARGIN + FOOTER_RESERVED) {
            // new page
            page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
            y = PAGE_HEIGHT - MARGIN
            drawTableHeader()
            return true
        }
        return false
    }

    // Sort entries by date then description for consistency with hash logic
    const sortedEntries = [...args.entries].sort((a, b) => {
        if (a.work_date !== b.work_date) return a.work_date < b.work_date ? -1 : 1
        return (a.description ?? '').localeCompare(b.description ?? '')
    })

    for (const e of sortedEntries) {
        ensureRoomForRow()
        const { day, weekday } = fmtDateShort(e.work_date)
        page.drawText(day, { x: cols.date.x, y: y - 10, size: 9, font: helvetica })
        page.drawText(weekday, { x: cols.weekday.x, y: y - 10, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) })

        const projectStr = clampStr(tr(e.project ?? '—'), 26)
        page.drawText(projectStr, { x: cols.project.x, y: y - 10, size: 9, font: helvetica })

        // Description: wrap if too long
        const descLines = wrapText(tr(e.description), 60)
        for (let i = 0; i < descLines.length; i++) {
            page.drawText(descLines[i], { x: cols.description.x, y: y - 10 - i * 11, size: 9, font: helvetica })
        }

        page.drawText(formatHours(e.hours) + ' h', {
            x: cols.hours.x,
            y: y - 10,
            size: 9,
            font: helvetica,
        })

        const rowHeight = Math.max(1, descLines.length) * 11 + 4
        y -= rowHeight
    }

    // Total row
    y -= 4
    page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5),
    })
    y -= 12
    page.drawText('Razem:', {
        x: cols.description.x,
        y: y,
        size: 10,
        font: helveticaBold,
    })
    page.drawText(formatHours(totalHours) + ' h', {
        x: cols.hours.x,
        y: y,
        size: 10,
        font: helveticaBold,
    })
    y -= 30

    // ─── Footer ────────────────────────────────────────────────────────────
    if (y < MARGIN + 110) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
    }

    const generatedAt = new Date().toISOString()
    const hashShort = (args.timesheet.pdf_hash ?? '').slice(0, 16)
    page.drawText(tr(`Wygenerowano: ${generatedAt}`), {
        x: MARGIN,
        y: y,
        size: 8,
        font: helveticaOblique,
        color: rgb(0.4, 0.4, 0.4),
    })
    y -= 11
    if (hashShort) {
        page.drawText(`Hash: ${hashShort}...`, {
            x: MARGIN,
            y: y,
            size: 8,
            font: helveticaOblique,
            color: rgb(0.4, 0.4, 0.4),
        })
        y -= 11
    }
    if (args.timesheet.approved_at) {
        page.drawText(tr(`Zaakceptowany: ${args.timesheet.approved_at}`), {
            x: MARGIN,
            y: y,
            size: 8,
            font: helveticaOblique,
            color: rgb(0.4, 0.4, 0.4),
        })
        y -= 11
    }

    y -= 30
    // Signature blocks
    const sigY = y
    page.drawLine({
        start: { x: MARGIN, y: sigY },
        end: { x: MARGIN + 220, y: sigY },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
    })
    page.drawText(tr('Podpis pracownika'), {
        x: MARGIN,
        y: sigY - 12,
        size: 9,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
    })

    page.drawLine({
        start: { x: PAGE_WIDTH - MARGIN - 220, y: sigY },
        end: { x: PAGE_WIDTH - MARGIN, y: sigY },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
    })
    page.drawText(tr('Podpis akceptujacego'), {
        x: PAGE_WIDTH - MARGIN - 220,
        y: sigY - 12,
        size: 9,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
    })

    return await pdfDoc.save()
}

export function timesheetPdfFilename(profile: ProfileForPdf, year: number, month: number): string {
    const slug = (profile.full_name ?? profile.email).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return `timesheet-${slug}-${year}-${String(month).padStart(2, '0')}.pdf`
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clampStr(s: string, maxChars: number): string {
    if (s.length <= maxChars) return s
    return s.slice(0, maxChars - 1) + '…'
}

function wrapText(s: string, maxCharsPerLine: number): string[] {
    if (!s) return ['']
    const words = s.split(/\s+/)
    const lines: string[] = []
    let current = ''
    for (const w of words) {
        if (!current) {
            current = w
        } else if ((current + ' ' + w).length <= maxCharsPerLine) {
            current += ' ' + w
        } else {
            lines.push(current)
            current = w
        }
    }
    if (current) lines.push(current)
    return lines.length > 0 ? lines : ['']
}
