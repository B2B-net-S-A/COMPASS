// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAcademyMaterialScan } from '../material-scanner'
import { MaterialRejected } from '../material-validation'

const av = vi.hoisted(() => ({ scan: vi.fn(), ready: vi.fn() }))
vi.mock('../clamav', () => ({ scanWithClamav: av.scan }))
vi.mock('../clamav-readiness', () => ({ assertClamavReadiness: av.ready }))
const realMp4 = () => readFileSync(join(process.cwd(), 'lib/academy/__tests__/fixtures/mp4/test-1s.mp4'))
const config = { host: 'private-scanner', port: 3310 }
function fixture(bytes: Buffer) {
    const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'academy_claim_material_scan'
        ? [{ id: 'asset', storage_path: 'reserved/asset/video.mp4', size_bytes: bytes.length, mime_type: 'video/mp4', scan_started_at: 'lease' }]
        : true }))
    const signed = vi.fn(async () => ({ error: null, data: { signedUrl: 'https://storage.test/reserved?signature=test' } }))
    const fetcher = vi.fn(async (_url: string | URL, _options: RequestInit) => new Response(new Uint8Array(bytes)))
    vi.stubGlobal('fetch', fetcher)
    return { rpc, signed, fetcher, client: { rpc, storage: { from: () => ({ createSignedUrl: signed }) } } as unknown as SupabaseClient }
}
beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.test')
    av.ready.mockReset().mockResolvedValue({})
    av.scan.mockReset().mockImplementation(async (source: AsyncIterable<Buffer>) => { for await (const chunk of source) expect(chunk.length).toBeGreaterThan(0) })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('MP4 validation is mandatory before the clean-scan ACK', () => {
    it('accepts a complete real AVC/AAC file only after both streaming checks', async () => {
        const bytes = realMp4(), f = fixture(bytes)
        expect(await runAcademyMaterialScan(f.client, config)).toMatchObject({ accepted: 1, rejected: 0, retry: 0 })
        expect(av.ready).toHaveBeenCalledWith(config)
        expect(av.scan).toHaveBeenCalledTimes(1)
        expect(f.rpc).toHaveBeenLastCalledWith('academy_accept_material_scan', { p_asset_id: 'asset', p_scan_started_at: 'lease', p_sha256: createHash('sha256').update(bytes).digest('hex') })
        expect(f.fetcher).toHaveBeenCalledTimes(1)
        expect(String(f.fetcher.mock.calls[0][0])).toBe('https://storage.test/reserved?signature=test')
        expect(f.fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store' })
    })
    it.each(['prefix', 'codec', 'missing-samples'])('rejects a clean AV result with invalid %s without a ready ACK', async kind => {
        let bytes = realMp4()
        if (kind === 'prefix') { bytes = Buffer.alloc(24); bytes.writeUInt32BE(24); bytes.write('ftypisom', 4) }
        if (kind === 'codec') bytes.write('hvc1', bytes.lastIndexOf('avc1'))
        if (kind === 'missing-samples') bytes.writeUInt32BE(bytes.length + 100, bytes.indexOf('stco') + 12)
        const f = fixture(bytes)
        expect(await runAcademyMaterialScan(f.client, config)).toMatchObject({ accepted: 0, rejected: 1, retry: 0 })
        expect(f.rpc).toHaveBeenLastCalledWith('academy_accept_material_scan', expect.objectContaining({ p_sha256: null, p_error: expect.any(String) }))
        expect(f.rpc).not.toHaveBeenCalledWith('academy_retry_material_scan', expect.anything())
    })
    it('does not let structural validity bypass AV rejection', async () => {
        const f = fixture(realMp4())
        av.scan.mockRejectedValue(new MaterialRejected('malware_or_scan_limit'))
        expect(await runAcademyMaterialScan(f.client, config)).toMatchObject({ accepted: 0, rejected: 1 })
        expect(f.rpc).toHaveBeenLastCalledWith('academy_accept_material_scan', expect.objectContaining({ p_sha256: null, p_error: 'malware_or_scan_limit' }))
    })
    it('cannot fetch a signed source outside the configured Storage origin', async () => {
        const f = fixture(realMp4()); f.signed.mockResolvedValue({ error: null, data: { signedUrl: 'https://untrusted.test/video.mp4' } })
        expect(await runAcademyMaterialScan(f.client, config)).toMatchObject({ accepted: 0, retry: 1 })
        expect(f.fetcher).not.toHaveBeenCalled()
        expect(av.scan).not.toHaveBeenCalled()
    })
})
