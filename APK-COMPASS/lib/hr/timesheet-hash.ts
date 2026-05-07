// Phase 11: deterministic content hash for timesheets.
// SHA-256 over a canonical serialization of entries — used as anti-tamper
// fingerprint stored on `timesheets.pdf_hash` at approve time and rendered
// in the PDF footer.

import { createHash } from 'crypto'

export interface TimesheetEntryForHash {
    work_date: string
    hours: number | string
    project: string | null
    description: string
}

export function computeTimesheetHash(entries: ReadonlyArray<TimesheetEntryForHash>): string {
    const sorted = [...entries].sort((a, b) => {
        if (a.work_date !== b.work_date) return a.work_date < b.work_date ? -1 : 1
        const an = `${Number(a.hours)}|${a.project ?? ''}|${a.description}`
        const bn = `${Number(b.hours)}|${b.project ?? ''}|${b.description}`
        return an < bn ? -1 : an > bn ? 1 : 0
    })
    const canonical = sorted
        .map((e) => `${e.work_date}|${Number(e.hours).toFixed(2)}|${e.project ?? ''}|${e.description}`)
        .join('\n')
    return createHash('sha256').update(canonical).digest('hex')
}
