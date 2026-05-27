import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parsePlacementsWorkbook } from '../parse-xlsx'

const HEADERS = [
    'Konsultant', 'Klient', 'DL', 'Stanowisko', 'Stawka kosztowa', 'Stawka przychodowa',
    'Marża', 'Marża miesięcznie', 'Data podpisania', 'Start day', 'Rekruter',
]

async function buildBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')
    ws.addRow(HEADERS)
    for (const r of rows) ws.addRow(r)
    return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

describe('parsePlacementsWorkbook', () => {
    it('parses valid rows with date cells and ISO strings', async () => {
        const buf = await buildBuffer([
            ['Adam Sadowski', 'NORDEA', 'Marcin Kraszewski', 'Tester', 130, 175, 45, 7560,
                new Date(Date.UTC(2026, 0, 23)), new Date(Date.UTC(2026, 3, 1)), 'Aleksandra Jaczyńska'],
            ['Damian Zarzycki', 'NORDEA', 'Marcin Kraszewski', 'Angular', 145, 185, 40, 6720,
                '2026-02-12', '2026-04-15', 'Marlena Rosół'],
        ])
        const res = await parsePlacementsWorkbook(buf)
        expect(res.errors).toEqual([])
        expect(res.rows).toHaveLength(2)
        expect(res.rows[0]).toMatchObject({
            consultantName: 'Adam Sadowski',
            clientName: 'NORDEA',
            deliveryLeadRaw: 'Marcin Kraszewski',
            recruiterRaw: 'Aleksandra Jaczyńska',
            costRate: 130,
            revenueRate: 175,
            signingDate: '2026-01-23',
            startDate: '2026-04-01',
            marginFromFile: 45,
        })
        expect(res.rows[1].startDate).toBe('2026-04-15')
    })

    it('reports rows missing a start date and excludes them', async () => {
        const buf = await buildBuffer([
            ['Brak Startu', 'NORDEA', 'DL X', 'Pos', 100, 140, 40, 6720, '2026-02-12', '', 'Rec Y'],
        ])
        const res = await parsePlacementsWorkbook(buf)
        expect(res.rows).toHaveLength(0)
        expect(res.errors.join(' ')).toMatch(/data startu/i)
    })

    it('errors when the Konsultant header is absent', async () => {
        const wb = new ExcelJS.Workbook()
        const ws = wb.addWorksheet('Sheet1')
        ws.addRow(['Foo', 'Bar', 'Baz'])
        ws.addRow([1, 2, 3])
        const res = await parsePlacementsWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer)
        expect(res.rows).toHaveLength(0)
        expect(res.errors.join(' ')).toMatch(/Konsultant/)
    })

    it('rejects signing date after start date', async () => {
        const buf = await buildBuffer([
            ['Late Signing', 'NORDEA', 'DL X', 'Pos', 100, 140, 40, 6720, '2026-05-01', '2026-04-01', 'Rec Y'],
        ])
        const res = await parsePlacementsWorkbook(buf)
        expect(res.rows).toHaveLength(0)
        expect(res.errors.join(' ')).toMatch(/podpisania/i)
    })

    it('reports scannedRows and skippedBlankRows separately', async () => {
        const buf = await buildBuffer([
            // Valid row
            ['Valid Person', 'NORDEA', 'DL X', 'Pos', 100, 140, 40, 6720, '2026-02-12', '2026-04-15', 'Rec Y'],
            // Fully blank separator
            ['', '', '', '', '', '', '', '', '', '', ''],
            // Row with date error (should land in errors[] + count as scanned)
            ['Bad Date', 'BNP', 'DL Z', 'Pos', 100, 140, 40, 6720, '', '1.04', 'Rec W'],
        ])
        const res = await parsePlacementsWorkbook(buf)
        expect(res.rows).toHaveLength(1)
        expect(res.scannedRows).toBe(2)
        expect(res.skippedBlankRows).toBe(1)
        expect(res.errors).toHaveLength(1)
        // Error message must surface the raw date so the user can see "1.04" → missing year
        expect(res.errors[0]).toMatch(/Bad Date/)
        expect(res.errors[0]).toMatch(/„1\.04"/)
    })

    it('flags a date without a year as invalid and surfaces the raw value', async () => {
        const buf = await buildBuffer([
            ['Adam Sadowski', 'NORDEA', 'DL X', 'Pos', 100, 140, 40, 6720, '2026-02-12', '1.04', 'Rec Y'],
        ])
        const res = await parsePlacementsWorkbook(buf)
        expect(res.rows).toHaveLength(0)
        expect(res.errors[0]).toMatch(/Adam Sadowski/)
        expect(res.errors[0]).toMatch(/wymagany rok/)
        expect(res.errors[0]).toMatch(/„1\.04"/)
    })
})
