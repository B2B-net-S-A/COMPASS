// Phase 39 — download a SharePoint/OneDrive-shared workbook via Microsoft Graph (app-only).
// Used by the daily TC sync cron. Requires the Graph Application permission Sites.Read.All
// (or Files.Read.All) granted to the Compass app — see CLAUDE.md Phase 39.

import { getGraphClient } from '@/lib/graph/client'

/**
 * Encode a sharing URL into the Graph `/shares/{u!...}` token:
 * base64(url) → strip `=` padding, `/`→`_`, `+`→`-`, prefixed with `u!`.
 * https://learn.microsoft.com/en-us/graph/api/shares-get
 */
export function shareToken(url: string): string {
    const b64 = Buffer.from(url, 'utf-8').toString('base64')
    return `u!${b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`
}

/** Download a workbook shared via a SharePoint/OneDrive link as a Buffer (app-only Graph). */
export async function downloadSharedWorkbook(shareUrl: string): Promise<Buffer> {
    const client = await getGraphClient()
    const token = shareToken(shareUrl)
    const res = await client.api(`/shares/${token}/driveItem/content`).responseType('arraybuffer').get()

    if (Buffer.isBuffer(res)) return res
    if (res instanceof ArrayBuffer) return Buffer.from(res)
    // Some SDK versions hand back a Blob-like with arrayBuffer(), or {data: ArrayBuffer}.
    const maybe = res as { arrayBuffer?: () => Promise<ArrayBuffer>; data?: unknown }
    if (typeof maybe?.arrayBuffer === 'function') return Buffer.from(await maybe.arrayBuffer())
    if (maybe?.data instanceof ArrayBuffer) return Buffer.from(maybe.data)
    throw new Error('Graph /shares/driveItem/content zwrócił nieoczekiwany typ odpowiedzi.')
}
