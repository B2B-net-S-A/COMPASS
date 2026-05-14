// Phase 11: bulk PDF export using JSZip.

import JSZip from 'jszip'
import {
    generateTimesheetPdf,
    timesheetPdfFilename,
    type GenerateTimesheetPdfArgs,
} from './timesheet-pdf'

export async function generateTimesheetZip(
    items: GenerateTimesheetPdfArgs[],
): Promise<Uint8Array> {
    const zip = new JSZip()
    for (const item of items) {
        const bytes = await generateTimesheetPdf(item)
        zip.file(timesheetPdfFilename(item.profile, item.timesheet.year, item.timesheet.month), bytes)
    }
    return await zip.generateAsync({ type: 'uint8array' })
}
