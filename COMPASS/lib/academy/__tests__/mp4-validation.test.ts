// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Mp4StreamValidator } from '../mp4-validation'
import { materialRejectionMessage } from '../material-errors'

const fixture = (name = 'test-1s.mp4') => readFileSync(join(process.cwd(), 'lib/academy/__tests__/fixtures/mp4', name))
function validate(bytes: Buffer, chunkSize = 8192, expectedSize = bytes.length) {
    const parser = new Mp4StreamValidator(expectedSize)
    for (let i = 0; i < bytes.length; i += chunkSize) parser.push(bytes.subarray(i, i + chunkSize))
    parser.finish()
}
function change(bytes: Buffer, type: string, write: (copy: Buffer, payload: number) => void) {
    const copy = Buffer.from(bytes), marker = copy.indexOf(type)
    expect(marker).toBeGreaterThan(0); write(copy, marker + 4); return copy
}
function box(type: string, payload = Buffer.alloc(0)) {
    const bytes = Buffer.alloc(8 + payload.length); bytes.writeUInt32BE(bytes.length); bytes.write(type, 4); payload.copy(bytes, 8); return bytes
}

describe('complete progressive AVC/AAC MP4 validation', () => {
    for (const name of ['test-1s.mp4', 'movie_5.mp4']) {
        it(`accepts real WPT ${name} with arbitrary stream boundaries`, () => {
            for (const chunk of [1, 7, 8192, 6 * 1024 ** 2]) expect(() => validate(fixture(name), chunk)).not.toThrow()
        })
    }
    it('rejects real WPT AVC video with MPEG-1 Layer III audio instead of AAC', () => {
        // Its esds objectTypeIndication is 0x6b; the mp4a box name alone is insufficient.
        expect(() => validate(fixture('2x2-green.mp4'), 7)).toThrow('unsupported_mp4_codec')
    })
    it('accepts a video-only file and does not require an artificial audio track', () => {
        const bytes = fixture(), start = bytes.indexOf('moov') - 4, end = start + bytes.readUInt32BE(start)
        const kept: Buffer[] = []
        for (let i = start + 8; i < end;) {
            const size = bytes.readUInt32BE(i), part = bytes.subarray(i, i + size)
            if (!(part.toString('ascii', 4, 8) === 'trak' && part.includes(Buffer.from('soun')))) kept.push(part)
            i += size
        }
        expect(() => validate(Buffer.concat([bytes.subarray(0, start), box('moov', Buffer.concat(kept)), bytes.subarray(end)]), 3)).not.toThrow()
    })
    it('accepts bounded extended-size movie boxes and a final mdat extending to EOF', () => {
        const bytes = fixture(), start = bytes.indexOf('moov') - 4, size = bytes.readUInt32BE(start)
        const header = Buffer.alloc(16); header.writeUInt32BE(1); header.write('moov', 4); header.writeBigUInt64BE(BigInt(size + 8), 8)
        expect(() => validate(Buffer.concat([bytes.subarray(0, start), header, bytes.subarray(start + 8)]), 1)).not.toThrow()
        const progressive = fixture('movie_5.mp4'); progressive.writeUInt32BE(0, progressive.indexOf('mdat') - 4)
        expect(() => validate(progressive, 7)).not.toThrow()
    })
    it('rejects the former 24-byte ftyp-only false positive', () => {
        const bytes = Buffer.alloc(24); bytes.writeUInt32BE(24); bytes.write('ftypisom', 4)
        expect(() => validate(bytes)).toThrow('incomplete_mp4')
    })
    it('rejects actual truncation and mismatched transfer length', () => {
        const bytes = fixture()
        for (const end of [1, 7, 16, 100, bytes.length - 1]) expect(() => validate(bytes.subarray(0, end))).toThrow()
        expect(() => validate(bytes, 8192, bytes.length + 1)).toThrow('incomplete_mp4')
        expect(() => validate(bytes, 8192, bytes.length - 1)).toThrow()
    })
    it('rejects HEVC, encrypted video and non-AAC audio entries', () => {
        for (const replacement of ['hvc1', 'encv', 'av01']) {
            const bytes = fixture(); bytes.write(replacement, bytes.lastIndexOf('avc1'))
            expect(() => validate(bytes)).toThrow('unsupported_mp4_codec')
        }
        const audio = fixture(); audio.write('ac-3', audio.indexOf('mp4a'))
        expect(() => validate(audio)).toThrow('unsupported_mp4_codec')
    })
    it('rejects unsupported AVC configuration and missing parameter sets', () => {
        for (const mutate of [(b: Buffer, p: number) => { b[p + 1] = 110 }, (b: Buffer, p: number) => { b[p + 5] = 0xe0 }, (b: Buffer, p: number) => { b.writeUInt16BE(65535, p + 6) }]) {
            expect(() => validate(change(fixture(), 'avcC', mutate))).toThrow()
        }
    })
    it('rejects HE-AAC and a truncated descriptor hidden inside an mp4a entry', () => {
        const bytes = fixture(), asc = bytes.indexOf(Buffer.from([0x12, 0x10, 0x56, 0xe5, 0]))
        expect(asc).toBeGreaterThan(0); bytes[asc] = 0x2a
        expect(() => validate(bytes)).toThrow('unsupported_mp4_codec')
        expect(() => validate(change(fixture(), 'esds', (b, p) => { b[p + 5] = 0x7f }))).toThrow()
    })
    it('rejects fragmented media before attempting to parse sample metadata', () => {
        expect(() => validate(Buffer.concat([fixture(), box('moof')]))).toThrow('fragmented_mp4_unsupported')
        expect(() => validate(Buffer.concat([fixture(), box('styp')]))).toThrow('fragmented_mp4_unsupported')
    })
    it('rejects samples pointing outside mdat, into box headers or to overlapping chunks', () => {
        for (const offset of [0, fixture().length + 1]) {
            expect(() => validate(change(fixture(), 'stco', (b, p) => b.writeUInt32BE(offset, p + 8)))).toThrow('incomplete_mp4_samples')
        }
        expect(() => validate(change(fixture(), 'stco', (b, p) => b.writeUInt32BE(b.readUInt32BE(p + 8), p + 12)))).toThrow('overlapping_mp4_samples')
    })
    it('checks all sample counts and sizes rather than trusting codec metadata', () => {
        expect(() => validate(change(fixture(), 'stsz', (b, p) => b.writeUInt32BE(0xffffffff, p + 8)))).toThrow()
        expect(() => validate(change(fixture(), 'stsz', (b, p) => b.writeUInt32BE(0x7fffffff, p + 12)))).toThrow('incomplete_mp4_samples')
        expect(() => validate(change(fixture(), 'stsc', (b, p) => b.writeUInt32BE(0xffffffff, p + 12)))).toThrow()
        expect(() => validate(change(fixture(), 'stts', (b, p) => b.writeUInt32BE(0xffffffff, p + 8)))).toThrow()
    })
    it('refuses external data references', () => {
        expect(() => validate(change(fixture(), 'url ', (b, p) => b.writeUInt32BE(0, p)))).toThrow('external_mp4_reference')
    })
    it('bounds metadata and unsafe 64-bit sizes before allocation', () => {
        const large = box('moov'); large.writeUInt32BE(8 * 1024 ** 2 + 1)
        const parser = new Mp4StreamValidator(1024 ** 3)
        expect(() => parser.push(large)).toThrow('mp4_metadata_limit')
        const extended = Buffer.alloc(16); extended.writeUInt32BE(1); extended.write('mdat', 4); extended.writeBigUInt64BE(2n ** 63n, 8)
        expect(() => new Mp4StreamValidator(1024 ** 3).push(extended)).toThrow()
    })
    it('does not accept trailing partial boxes or duplicate movie metadata', () => {
        expect(() => validate(Buffer.concat([fixture(), Buffer.from([1])]))).toThrow('incomplete_mp4')
        expect(() => validate(Buffer.concat([fixture(), box('moov')]))).toThrow('mp4_metadata_limit')
    })
    it('does not mask high bits in box identifiers into accepted ASCII', () => {
        const bytes = fixture(); bytes[4] |= 0x80
        expect(() => validate(bytes)).toThrow('unsupported_mp4_structure')
    })
    it('only exposes fixed actionable rejection messages', () => {
        expect(materialRejectionMessage('fragmented_mp4_unsupported')).toContain('Segmentowane nagrania')
        expect(materialRejectionMessage('unsupported_mp4_codec')).toContain('AAC-LC')
        expect(materialRejectionMessage('incomplete_mp4_samples')).toContain('niekompletny')
        expect(materialRejectionMessage('https://private.test?token=secret')).not.toContain('secret')
    })
})
