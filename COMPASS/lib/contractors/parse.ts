// Phase 33 — Kontraktorzy: parse the 3 TCM Excel formats into validated rows.
// Server-side only (exceljs). Mirrors the Phase 28 placements parser conventions
// (header detection, cell coercion, date parsing with explicit year).

import ExcelJS from 'exceljs'
import { isValid, parse as parseDateFns, parseISO } from 'date-fns'
import {
    conversationStatusFromFill,
    normalizeConversationCategory,
    normalizeWhoResigned,
    type ConversationCategory,
    type ConversationStatus,
    type WhoResigned,
} from '@/lib/types/contractor'

type CellVal = ExcelJS.CellValue

// ─── Shared cell coercion (copied from placements/parse-xlsx conventions) ─────
function normHeader(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cellString(v: CellVal): string {
    if (v == null) return ''
    if (typeof v === 'string') return v.trim()
    if (typeof v === 'number') return String(v)
    if (v instanceof Date) return isoFromDate(v)
    if (typeof v === 'object') {
        const o = v as unknown as Record<string, unknown>
        if (typeof o.text === 'string') return o.text.trim()
        if (Array.isArray(o.richText)) return o.richText.map((r) => (r as { text?: string }).text ?? '').join('').trim()
        if ('result' in o) return cellString(o.result as CellVal)
    }
    return ''
}

function cellNumber(v: CellVal): number | null {
    if (v == null || v === '') return null
    if (typeof v === 'number') return v
    if (typeof v === 'object' && v !== null && 'result' in (v as object)) {
        return cellNumber((v as { result: CellVal }).result)
    }
    const s = cellString(v).replace(/\s/g, '').replace(',', '.')
    if (s === '') return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
}

function isoFromDate(d: Date): string {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function cellDate(v: CellVal): string | null {
    if (v == null || v === '') return null
    if (v instanceof Date) return isoFromDate(v)
    if (typeof v === 'object' && v !== null && 'result' in (v as object)) {
        return cellDate((v as { result: CellVal }).result)
    }
    const s = cellString(v)
    if (!s) return null
    const iso = parseISO(s)
    if (isValid(iso) && /\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    for (const fmt of ['dd.MM.yyyy', 'dd-MM-yyyy', 'dd/MM/yyyy', 'yyyy.MM.dd']) {
        const d = parseDateFns(s, fmt, new Date())
        if (isValid(d)) return isoFromDate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))
    }
    return null
}

/** ARGB hex of a solid fill, if any (for conversation status colour). */
function cellFillArgb(cell: ExcelJS.Cell): string | null {
    const fill = cell.fill as ExcelJS.FillPattern | undefined
    if (!fill || fill.type !== 'pattern') return null
    const fg = fill.fgColor as { argb?: string } | undefined
    return fg?.argb ?? null
}

interface SheetHit {
    ws: ExcelJS.Worksheet
    headerRowNo: number
    colIndex: Record<string, number>
}

/** Find the worksheet + header row whose header contains all of `markers` (normalized). */
function findSheet(wb: ExcelJS.Workbook, markers: string[]): SheetHit | null {
    const wanted = markers.map(normHeader)
    for (const ws of wb.worksheets) {
        for (let r = 1; r <= Math.min(ws.rowCount, 5); r += 1) {
            const headers: Record<string, number> = {}
            ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
                const h = normHeader(cellString(cell.value))
                if (h) headers[h] = col
            })
            if (wanted.every((m) => headers[m] != null)) {
                return { ws, headerRowNo: r, colIndex: headers }
            }
        }
    }
    return null
}

function col(hit: SheetHit, header: string): number | undefined {
    return hit.colIndex[normHeader(header)]
}

// ─── Parsed row shapes ────────────────────────────────────────────────────────
export interface ParsedConversation {
    rowNumber: number
    fullName: string
    phone: string | null
    client: string | null
    conversationDate: string | null
    tcmRaw: string | null
    category: ConversationCategory
    status: ConversationStatus | null
    note: string | null
}

export interface ParsedEntry {
    rowNumber: number
    fullName: string
    client: string
    recruiterRaw: string | null
    deliveryLeadRaw: string | null
    signingDate: string | null
    startDate: string | null
    orderTerm: string | null
    orderNumber: string | null
    guarantee: string | null
    costRate: number | null
    revenueRate: number | null
    monthlyMargin: number | null
    noteAm: string | null
    noteBilling: string | null
    noteHr: string | null
}

export interface ParsedDeparture {
    rowNumber: number
    fullName: string
    client: string
    recruiterRaw: string | null
    position: string | null
    startDate: string | null
    departureDate: string | null
    lastNoticeDay: string | null
    guaranteeRatio: number | null
    whoResigned: WhoResigned | null
    reason: string | null
    managerRaw: string | null
    transferred: boolean
    replacement: boolean
    comment: string | null
    orderTerm: string | null
    orderNumber: string | null
    costRate: number | null
    revenueRate: number | null
    monthlyMargin: number | null
    noteAm: string | null
    noteHr: string | null
}

export interface ParseResult<T> {
    rows: T[]
    errors: string[]
    scannedRows: number
    skippedBlankRows: number
}

async function loadWorkbook(buffer: ArrayBuffer | Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
    return wb
}

function truthyBool(v: CellVal): boolean {
    const s = cellString(v).toLowerCase()
    return s === 'true' || s === 'tak' || s === '1' || s === 'yes' || s === 'x'
}

// ─── 1. Rozmowy z kontraktorami ───────────────────────────────────────────────
export async function parseRozmowyWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParseResult<ParsedConversation>> {
    const wb = await loadWorkbook(buffer)
    const hit = findSheet(wb, ['Imię', 'Sprawa'])
    if (!hit) {
        return { rows: [], errors: ['Nie znaleziono arkusza rozmów (oczekiwano kolumn „Imię", „Sprawa").'], scannedRows: 0, skippedBlankRows: 0 }
    }
    const rows: ParsedConversation[] = []
    const errors: string[] = []
    let scannedRows = 0
    let skippedBlankRows = 0
    let blankRun = 0 // stop after a long run of blank rows (sheets bloated to 1M-row dimension)

    for (let r = hit.headerRowNo + 1; r <= hit.ws.rowCount; r += 1) {
        const row = hit.ws.getRow(r)
        const get = (h: string): CellVal => {
            const c = col(hit, h)
            return c != null ? row.getCell(c).value : null
        }
        const firstName = cellString(get('Imię'))
        const lastName = cellString(get('Nazwisko'))
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
        const sprawa = cellString(get('Sprawa'))
        const note = cellString(get('Notatka'))
        const client = cellString(get('Klient'))

        if (!fullName && !sprawa && !note && !client) {
            skippedBlankRows += 1
            if (++blankRun > 200) break
            continue
        }
        blankRun = 0
        scannedRows += 1
        if (!fullName) {
            errors.push(`Wiersz ${r}: brak imienia/nazwiska — pominięto.`)
            continue
        }

        // Status from the coloured cell — scan name + sprawa + note cells, take first hit.
        let status: ConversationStatus | null = null
        for (const h of ['Imię', 'Nazwisko', 'Sprawa', 'Notatka']) {
            const c = col(hit, h)
            if (c == null) continue
            status = conversationStatusFromFill(cellFillArgb(row.getCell(c)))
            if (status) break
        }

        rows.push({
            rowNumber: r,
            fullName,
            phone: cellString(get('Nr telefonu')) || null,
            client: client || null,
            conversationDate: cellDate(get('Data rozmowy')),
            tcmRaw: cellString(get('TCM')) || null,
            category: normalizeConversationCategory(sprawa),
            status,
            note: note || null,
        })
    }
    if (rows.length === 0 && errors.length === 0) errors.push('Brak wierszy z danymi.')
    return { rows, errors, scannedRows, skippedBlankRows }
}

// ─── 2. Wejścia do klientów ───────────────────────────────────────────────────
export async function parseWejsciaWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParseResult<ParsedEntry>> {
    const wb = await loadWorkbook(buffer)
    const hit = findSheet(wb, ['Klient', 'Odpowiedzialny rekruter', 'Start date'])
    if (!hit) {
        return { rows: [], errors: ['Nie znaleziono arkusza wejść (oczekiwano „Klient", „Odpowiedzialny rekruter", „Start date").'], scannedRows: 0, skippedBlankRows: 0 }
    }
    const nameCol = col(hit, 'Imię i Nazwisko') ?? col(hit, 'Imię i nazwisko')
    const rows: ParsedEntry[] = []
    const errors: string[] = []
    let scannedRows = 0
    let skippedBlankRows = 0
    let blankRun = 0 // stop after a long run of blank rows (sheets bloated to 1M-row dimension)

    for (let r = hit.headerRowNo + 1; r <= hit.ws.rowCount; r += 1) {
        const row = hit.ws.getRow(r)
        const get = (h: string): CellVal => {
            const c = col(hit, h)
            return c != null ? row.getCell(c).value : null
        }
        const fullName = nameCol != null ? cellString(row.getCell(nameCol).value) : ''
        const client = cellString(get('Klient'))
        if (!fullName && !client) {
            skippedBlankRows += 1
            if (++blankRun > 200) break
            continue
        }
        blankRun = 0
        scannedRows += 1
        if (!fullName || !client) {
            errors.push(`Wiersz ${r}: brak ${!fullName ? 'nazwiska' : 'klienta'} — pominięto.`)
            continue
        }
        rows.push({
            rowNumber: r,
            fullName,
            client,
            recruiterRaw: cellString(get('Odpowiedzialny rekruter')) || null,
            deliveryLeadRaw: cellString(get('Delivery Lead')) || null,
            signingDate: cellDate(get('Data podpisania umowy')),
            startDate: cellDate(get('Start date')),
            orderTerm: cellString(get('Termin Zamówienia')) || null,
            orderNumber: cellString(get('Numer Zamówienia')) || null,
            guarantee: cellString(get('Gwarancja')) || null,
            costRate: cellNumber(get('Stawka kosztowa')),
            revenueRate: cellNumber(get('Stawka przychodowa')),
            monthlyMargin: cellNumber(get('Marża *168 = zysk dla firmy')) ?? cellNumber(get('Marża *168 = zysk')),
            noteAm: cellString(get('Notatka AM')) || null,
            noteBilling: cellString(get('Notatka Rozliczenia')) || null,
            noteHr: cellString(get('Notatka HR')) || null,
        })
    }
    if (rows.length === 0 && errors.length === 0) errors.push('Brak wierszy z danymi.')
    return { rows, errors, scannedRows, skippedBlankRows }
}

// ─── 3. Zejścia od klientów ───────────────────────────────────────────────────
export async function parseZejsciaWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParseResult<ParsedDeparture>> {
    const wb = await loadWorkbook(buffer)
    const hit = findSheet(wb, ['Klient', 'Data zejścia', 'Kto zrezygnował'])
    if (!hit) {
        return { rows: [], errors: ['Nie znaleziono arkusza zejść (oczekiwano „Klient", „Data zejścia", „Kto zrezygnował").'], scannedRows: 0, skippedBlankRows: 0 }
    }
    const nameCol = col(hit, 'Imię i Nazwisko') ?? col(hit, 'Imię i nazwisko')
    const rows: ParsedDeparture[] = []
    const errors: string[] = []
    let scannedRows = 0
    let skippedBlankRows = 0
    let blankRun = 0 // stop after a long run of blank rows (sheets bloated to 1M-row dimension)

    for (let r = hit.headerRowNo + 1; r <= hit.ws.rowCount; r += 1) {
        const row = hit.ws.getRow(r)
        const get = (h: string): CellVal => {
            const c = col(hit, h)
            return c != null ? row.getCell(c).value : null
        }
        const fullName = nameCol != null ? cellString(row.getCell(nameCol).value) : ''
        const client = cellString(get('Klient'))
        if (!fullName && !client) {
            skippedBlankRows += 1
            if (++blankRun > 200) break
            continue
        }
        blankRun = 0
        scannedRows += 1
        if (!fullName || !client) {
            errors.push(`Wiersz ${r}: brak ${!fullName ? 'nazwiska' : 'klienta'} — pominięto.`)
            continue
        }
        rows.push({
            rowNumber: r,
            fullName,
            client,
            recruiterRaw: cellString(get('Odpowiedzialny rekruter')) || null,
            position: cellString(get('Stanowisko')) || null,
            startDate: cellDate(get('Start date')),
            departureDate: cellDate(get('Data zejścia')),
            lastNoticeDay: cellDate(get('Ostatni dzień wypowiedzenia')),
            guaranteeRatio: cellNumber(get('Gwarancja')),
            whoResigned: normalizeWhoResigned(cellString(get('Kto zrezygnował'))),
            reason: cellString(get('Powód')) || null,
            managerRaw: cellString(get('Manager')) || null,
            transferred: truthyBool(get('Przepięcie')),
            replacement: truthyBool(get('Replacement')),
            comment: cellString(get('Komentarz')) || null,
            orderTerm: cellString(get('Termin Zamówienia')) || null,
            orderNumber: cellString(get('Numer Zamówienia')) || null,
            costRate: cellNumber(get('Stawka kosztowa')),
            revenueRate: cellNumber(get('Stawka przychodowa')),
            monthlyMargin: cellNumber(get('Marża *168 = strata dla firmy')) ?? cellNumber(get('Marża *168 = strata')),
            noteAm: cellString(get('Notatka AM')) || null,
            noteHr: cellString(get('Notatka HR')) || null,
        })
    }
    if (rows.length === 0 && errors.length === 0) errors.push('Brak wierszy z danymi.')
    return { rows, errors, scannedRows, skippedBlankRows }
}
