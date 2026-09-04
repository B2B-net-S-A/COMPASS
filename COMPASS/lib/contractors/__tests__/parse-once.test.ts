import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { loadWorkbook, parseWejsciaFromWorkbook, parseZejsciaFromWorkbook } from '../parse'

// tc-sync (app/api/cron/tc-sync) imports both the "wejścia" and "zejścia" sheets from ONE
// ~9.5 MB SharePoint workbook. Previously each importer re-loaded and re-parsed the same buffer
// (two full exceljs passes) — the dominant CPU/allocation cost on a cron running on a swap-less
// host, which was killing the container mid-run. It now loads once and hands the parsed workbook
// to both sheet parsers. This guards that contract: a single loaded workbook feeds both.
async function buildTcWorkbook(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    const we = wb.addWorksheet('Wejścia')
    we.addRow(['Imię i Nazwisko', 'Klient', 'Odpowiedzialny rekruter', 'Start date'])
    we.addRow(['Jan Kowalski', 'ACME Sp. z o.o.', 'Anna Nowak', '2026-09-01'])
    const ze = wb.addWorksheet('Zejścia')
    ze.addRow(['Imię i Nazwisko', 'Klient', 'Data zejścia', 'Kto zrezygnował'])
    ze.addRow(['Piotr Zielinski', 'ACME Sp. z o.o.', '2026-08-31', 'konsultant'])
    return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('tc-sync parse-once', () => {
    it('feeds both sheet parsers from a single loaded workbook', async () => {
        const buffer = await buildTcWorkbook()
        const wb = await loadWorkbook(buffer)

        const wejscia = parseWejsciaFromWorkbook(wb)
        expect(wejscia.errors).toEqual([])
        expect(wejscia.rows).toHaveLength(1)
        expect(wejscia.rows[0].fullName).toBe('Jan Kowalski')
        expect(wejscia.rows[0].client).toBeTruthy()
        expect(wejscia.rows[0].startDate).toBe('2026-09-01')

        const zejscia = parseZejsciaFromWorkbook(wb)
        expect(zejscia.errors).toEqual([])
        expect(zejscia.rows).toHaveLength(1)
        expect(zejscia.rows[0].fullName).toBe('Piotr Zielinski')
        expect(zejscia.rows[0].client).toBeTruthy()
        expect(zejscia.rows[0].departureDate).toBe('2026-08-31')
    })
})
