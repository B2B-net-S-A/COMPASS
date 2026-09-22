import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scanWithClamav, type ClamavConfig } from './clamav'
import { assertClamavReadiness } from './clamav-readiness'
import { validateMaterialFormat, MaterialRejected } from './material-validation'
import { Mp4StreamValidator } from './mp4-validation'

interface ScanAsset {
    id: string; storage_path: string; size_bytes: number; mime_type: string; scan_started_at: string
}

export function academyScannerConfiguration(env = process.env): ClamavConfig | null {
    if (!env.ACADEMY_CLAMAV_HOST) return null
    const port = Number(env.ACADEMY_CLAMAV_PORT ?? 3310)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return { host: env.ACADEMY_CLAMAV_HOST, port }
}

/** One bounded, leased scan. Bytes stream to AV and hashing; only documents buffer <=50MB. */
export async function runAcademyMaterialScan(client: SupabaseClient, config = academyScannerConfiguration()) {
    if (!config) return { configured: false, scanned: 0, accepted: 0, rejected: 0, retry: 0 }
    // Do not lease work to a daemon with stale signatures: a healthy TCP socket
    // alone does not establish that uploaded content can be checked safely.
    await assertClamavReadiness(config)
    const { data, error } = await client.rpc('academy_claim_material_scan')
    if (error) throw new Error('material_claim_failed')
    const asset = (data as ScanAsset[] | null)?.[0]
    if (!asset) return { configured: true, scanned: 0, accepted: 0, rejected: 0, retry: 0 }
    const abort = new AbortController()
    const deadline = setTimeout(() => abort.abort(), 240_000)
    try {
        const size = Number(asset.size_bytes)
        if (!Number.isSafeInteger(size) || size <= 0 || size > 1024 ** 3) throw new MaterialRejected('invalid_size')
        const signed = await client.storage.from('academy-materials').createSignedUrl(asset.storage_path, 300)
        if (signed.error || !signed.data) throw new Error('storage_unavailable')
        const url = new URL(signed.data.signedUrl)
        const configuredOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
        if (url.origin !== configuredOrigin) throw new Error('storage_origin_mismatch')
        const response = await fetch(url, { signal: abort.signal, redirect: 'error', cache: 'no-store' })
        if (!response.ok || !response.body) throw new Error('storage_unavailable')
        const hash = createHash('sha256')
        let total = 0
        let prefix = Buffer.alloc(0)
        const chunks: Buffer[] = []
        const isDocument = asset.mime_type !== 'video/mp4'
        const mp4 = isDocument ? null : new Mp4StreamValidator(size)
        async function* bytes() {
            const reader = response.body!.getReader()
            try {
                while (true) {
                    const next = await reader.read()
                    if (next.done) break
                    const chunk = Buffer.from(next.value)
                    total += chunk.length
                    if (total > size || (isDocument && total > 50 * 1024 ** 2)) throw new MaterialRejected('size_mismatch')
                    hash.update(chunk)
                    if (prefix.length < 64) prefix = Buffer.concat([prefix, chunk.subarray(0, 64 - prefix.length)])
                    if (isDocument) chunks.push(chunk)
                    mp4?.push(chunk)
                    yield chunk
                }
            } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
        }
        await scanWithClamav(bytes(), config)
        if (total !== size) throw new MaterialRejected('size_mismatch')
        if (mp4) mp4.finish()
        else await validateMaterialFormat(asset.mime_type, prefix, Buffer.concat(chunks))
        const accepted = await client.rpc('academy_accept_material_scan', { p_asset_id: asset.id, p_scan_started_at: asset.scan_started_at, p_sha256: hash.digest('hex') })
        if (accepted.error) throw new Error('scan_persistence_failed')
        return { configured: true, scanned: 1, accepted: accepted.data ? 1 : 0, rejected: 0, retry: 0 }
    } catch (cause) {
        const rejected = cause instanceof MaterialRejected
        const outcome = rejected
            ? await client.rpc('academy_accept_material_scan', { p_asset_id: asset.id, p_scan_started_at: asset.scan_started_at, p_sha256: null, p_error: cause.code })
            : await client.rpc('academy_retry_material_scan', { p_asset_id: asset.id, p_scan_started_at: asset.scan_started_at })
        if (outcome.error) throw new Error('scan_failure_persistence_failed')
        return { configured: true, scanned: 1, accepted: 0, rejected: rejected && outcome.data ? 1 : 0, retry: !rejected && outcome.data ? 1 : 0 }
    } finally { clearTimeout(deadline); abort.abort() }
}
