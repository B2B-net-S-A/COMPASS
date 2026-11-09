// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { preflightMp4 } from '../mp4-preflight'
import { materialRejectionMessage } from '../material-errors'

const fixture = (name: string) => readFileSync(join(process.cwd(), 'lib/academy/__tests__/fixtures/mp4', name))
const blob = (bytes: Uint8Array) => new Blob([Uint8Array.from(bytes)])
function box(type: string, payload = new Uint8Array(0)) {
    const bytes = Buffer.alloc(8 + payload.length)
    bytes.writeUInt32BE(bytes.length)
    bytes.write(type, 4, 'latin1')
    Buffer.from(payload).copy(bytes, 8)
    return bytes
}
const ftyp = box('ftyp', Buffer.from('isom\0\0\x02\0isom', 'latin1'))
const moovWith = (text: string) => box('moov', Buffer.from(text, 'latin1'))
const mdat = box('mdat', Buffer.alloc(16))

describe('preflightMp4', () => {
    it('accepts real AVC files with moov first or last', async () => {
        await expect(preflightMp4(blob(fixture('test-1s.mp4')))).resolves.toBeNull()
        await expect(preflightMp4(blob(fixture('movie_5.mp4')))).resolves.toBeNull()
    })
    it('accepts a large declared mdat without reading it', async () => {
        const file = Buffer.concat([ftyp, moovWith('xxavc1xx'), box('mdat', Buffer.alloc(1024 * 1024))])
        await expect(preflightMp4(blob(file))).resolves.toBeNull()
    })
    it('rejects a file that does not start with ftyp or has an unknown brand', async () => {
        await expect(preflightMp4(blob(Buffer.concat([mdat, ftyp])))).resolves.toBe('invalid_mp4_structure')
        await expect(preflightMp4(blob(Buffer.concat([box('ftyp', Buffer.from('qt  \0\0\0\0', 'latin1')), moovWith('avc1')])))).resolves.toBe('invalid_mp4_structure')
    })
    it('rejects a declared box larger than the file', async () => {
        const bad = Buffer.from(ftyp)
        bad.writeUInt32BE(bad.length + 100)
        await expect(preflightMp4(blob(bad))).resolves.toBe('invalid_mp4_structure')
    })
    it('rejects a missing moov and an oversized moov', async () => {
        await expect(preflightMp4(blob(Buffer.concat([ftyp, mdat])))).resolves.toBe('incomplete_mp4')
        await expect(preflightMp4(blob(Buffer.concat([ftyp, moovWith('avc1'.padEnd(8 * 1024 ** 2 + 1, 'x'))])))).resolves.toBe('mp4_metadata_limit')
    })
    it('rejects fragmented files by box and by mvex', async () => {
        await expect(preflightMp4(blob(Buffer.concat([ftyp, moovWith('avc1'), box('moof')])))).resolves.toBe('fragmented_mp4_unsupported')
        await expect(preflightMp4(blob(Buffer.concat([ftyp, moovWith('avc1mvex')])))).resolves.toBe('fragmented_mp4_unsupported')
    })
    it('rejects HEVC, AV1 and encrypted entries, and a file with no AVC at all', async () => {
        for (const codec of ['hvc1', 'hev1', 'av01', 'encv']) await expect(preflightMp4(blob(Buffer.concat([ftyp, moovWith(`avc1${codec}`)])))).resolves.toBe('unsupported_mp4_codec')
        await expect(preflightMp4(blob(Buffer.concat([ftyp, moovWith('mp4a')])))).resolves.toBe('unsupported_mp4_codec')
    })
    it('stops on a box count bomb', async () => {
        const many = Buffer.concat([ftyp, ...Array.from({ length: 300 }, () => box('free'))])
        await expect(preflightMp4(blob(many))).resolves.toBe('unsupported_mp4_structure')
    })
    it('every code has an actionable message', async () => {
        for (const code of ['invalid_mp4_structure', 'incomplete_mp4', 'mp4_metadata_limit', 'fragmented_mp4_unsupported', 'unsupported_mp4_codec', 'unsupported_mp4_structure']) expect(materialRejectionMessage(code).length).toBeGreaterThan(20)
    })
})
