// Phase 28 — Placementy: parse the uploaded .xlsx into validated rows.
// Server-side only (exceljs). Dates are expected with an explicit year (real date cells
// or ISO strings) per the agreed template; a dd.mm.yyyy fallback is tolerated.

import ExcelJS from 'exceljs'
import { isValid, parse as parseDateFns, parseISO } from 'date-fns'
import { PLACEMENT_COLUMNS, type ParsedPlacementRow } from '@/lib/types/placement'

export interface ParseResult {
    rows: ParsedPlacementRow[]
    errors: string[]
    /** Total non-empty rows that the parser scanned below the header (= rejected + accepted). */
    scannedRows: number
    /** Rows skipped silently because every required identifier (consultant/client/DL/rekruter) was blank. */
    skippedBlankRows: number
}

type CellVal = ExcelJS.CellValue

function normHeader(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Coerce an exceljs cell value to a trimmed string (handles richText / formula results). */
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
        if (typeof o.hyperlink === 'string' && typeof o.text === 'string') return String(o.text).trim()
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

/** Build yyyy-mm-dd from a Date using its UTC parts (date-only cells are UTC-midnight). */
function isoFromDate(d: Date): string {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

/** Parse a date cell to ISO yyyy-mm-dd, or null if unparseable. Requires an explicit year. */
function cellDate(v: CellVal): string | null {
    if (v == null || v === '') return null
    if (v instanceof Date) return isoFromDate(v)
    if (typeof v === 'object' && v !== null && 'result' in (v as object)) {
        return cellDate((v as { result: CellVal }).result)
    }
    const s = cellString(v)
    if (!s) return null
    // ISO first.
    const iso = parseISO(s)
    if (isValid(iso) && /\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    // dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy fallback (explicit 4-digit year only).
    for (const fmt of ['dd.MM.yyyy', 'dd-MM-yyyy', 'dd/MM/yyyy', 'yyyy.MM.dd']) {
        const d = parseDateFns(s, fmt, new Date())
        if (isValid(d)) return isoFromDate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))
    }
    return null
}

/**
 * Parse the first worksheet. Header row is detected as the first row containing
 * the "Konsultant" header. Rows with hard validation errors are excluded and reported.
 */
export async function parsePlacementsWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParseResult> {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
    const ws = wb.worksheets[0]
    if (!ws) return { rows: [], errors: ['Plik nie zawiera żadnego arkusza.'], scannedRows: 0, skippedBlankRows: 0 }

    // Locate header row + column indices.
    const wantedConsultant = normHeader(PLACEMENT_COLUMNS.consultant)
    let headerRowNo = -1
    const colIndex: Record<string, number> = {}
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r += 1) {
        const row = ws.getRow(r)
        const headers: Record<string, number> = {}
        row.eachCell({ includeEmpty: false }, (cell, col) => {
            const h = normHeader(cellString(cell.value))
            if (h) headers[h] = col
        })
        if (headers[wantedConsultant] != null) {
            headerRowNo = r
            Object.assign(colIndex, headers)
            break
        }
    }
    if (headerRowNo === -1) {
        return {
            rows: [],
            errors: [`Nie znaleziono nagłówka „${PLACEMENT_COLUMNS.consultant}". Sprawdź czy plik ma poprawne kolumny.`],
            scannedRows: 0,
            skippedBlankRows: 0,
        }
    }

    const col = (key: keyof typeof PLACEMENT_COLUMNS): number | undefined => colIndex[normHeader(PLACEMENT_COLUMNS[key])]
    const required: Array<keyof typeof PLACEMENT_COLUMNS> = [
        'consultant', 'client', 'deliveryLead', 'costRate', 'revenueRate', 'startDate', 'recruiter',
    ]
    const missing = required.filter((k) => col(k) == null)
    if (missing.length > 0) {
        return {
            rows: [],
            errors: [`Brak wymaganych kolumn: ${missing.map((k) => PLACEMENT_COLUMNS[k]).join(', ')}.`],
            scannedRows: 0,
            skippedBlankRows: 0,
        }
    }

    const rows: ParsedPlacementRow[] = []
    const errors: string[] = []
    let scannedRows = 0
    let skippedBlankRows = 0

    for (let r = headerRowNo + 1; r <= ws.rowCount; r += 1) {
        const row = ws.getRow(r)
        const get = (key: keyof typeof PLACEMENT_COLUMNS): CellVal => {
            const c = col(key)
            return c != null ? row.getCell(c).value : null
        }

        const consultantName = cellString(get('consultant'))
        const clientName = cellString(get('client'))
        const deliveryLeadRaw = cellString(get('deliveryLead'))
        const recruiterRaw = cellString(get('recruiter'))

        // Detect whether ANY cell in the row has data — needed to distinguish a fully blank
        // separator row from a row that has some data but missing identifiers (e.g. only a
        // date, or only a position — typical when a user paste-overwrites part of a row).
        const hasAnyValue =
            consultantName.length > 0 ||
            clientName.length > 0 ||
            deliveryLeadRaw.length > 0 ||
            recruiterRaw.length > 0 ||
            cellString(get('position')).length > 0 ||
            cellNumber(get('costRate')) != null ||
            cellNumber(get('revenueRate')) != null ||
            cellString(get('startDate')).length > 0 ||
            cellString(get('signingDate')).length > 0 ||
            cellNumber(get('margin')) != null ||
            cellNumber(get('monthlyMargin')) != null

        if (!hasAnyValue) {
            // Truly blank row — skip silently but count it so the dialog can show the total.
            skippedBlankRows += 1
            continue
        }

        // From here on, the row counts as "scanned" (= seen by the parser, with at least one
        // non-empty cell). Either it lands in `rows` (valid) or `errors` (rejected with reason).
        scannedRows += 1

        const rowErrs: string[] = []
        if (!consultantName) rowErrs.push('brak konsultanta')
        if (!clientName) rowErrs.push('brak klienta')
        if (!deliveryLeadRaw) rowErrs.push('brak DL')
        if (!recruiterRaw) rowErrs.push('brak rekrutera')

        const costRate = cellNumber(get('costRate'))
        const revenueRate = cellNumber(get('revenueRate'))
        if (costRate == null) rowErrs.push('brak/niepoprawna stawka kosztowa')
        if (revenueRate == null) rowErrs.push('brak/niepoprawna stawka przychodowa')

        const startDate = cellDate(get('startDate'))
        if (!startDate) {
            // Surface the raw cell value so the user can SEE the difference between
            // "1.04" (no year) and "2026-04-01" (parseable) without opening Excel.
            const rawStart = cellString(get('startDate'))
            const detail = rawStart ? ` (w pliku: „${rawStart}")` : ''
            rowErrs.push(`brak/niepoprawna data startu (wymagany rok, np. 2026-04-01)${detail}`)
        }
        const signingDate = cellDate(get('signingDate'))

        if (startDate && signingDate && signingDate > startDate) {
            rowErrs.push('data podpisania jest po dacie startu')
        }

        if (rowErrs.length > 0) {
            const label = consultantName || clientName || `(wiersz ${r})`
            errors.push(`Wiersz ${r} [${label}]: ${rowErrs.join(', ')}.`)
            continue
        }

        rows.push({
            rowNumber: r,
            consultantName,
            clientName,
            position: cellString(get('position')) || null,
            deliveryLeadRaw,
            recruiterRaw,
            costRate: costRate as number,
            revenueRate: revenueRate as number,
            signingDate,
            startDate: startDate as string,
            marginFromFile: cellNumber(get('margin')),
            monthlyMarginFromFile: cellNumber(get('monthlyMargin')),
        })
    }

    if (rows.length === 0 && errors.length === 0) {
        errors.push('Plik nie zawiera żadnych wierszy z danymi.')
    }
    return { rows, errors, scannedRows, skippedBlankRows }
}
