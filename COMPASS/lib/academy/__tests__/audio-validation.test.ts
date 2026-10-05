// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Mp3StreamValidator } from '../mp3-validation'
import { Mp4StreamValidator } from '../mp4-validation'
const frame = () => { const data = Buffer.alloc(417); data.set([255,251,144,0]); return data }
function mp3(bytes: Buffer, chunk = 1) { const parser = new Mp3StreamValidator(bytes.length); for (let i = 0; i < bytes.length; i += chunk) parser.push(bytes.subarray(i, i + chunk)); parser.finish() }
function audioMovie() {
    const source = readFileSync('lib/academy/__tests__/fixtures/mp4/test-1s.mp4')
    const start = source.indexOf('moov') - 4, end = start + source.readUInt32BE(start), parts: Buffer[] = []
    for (let p = start + 8; p < end;) { const size = source.readUInt32BE(p), part = source.subarray(p, p + size); if (!(part.toString('ascii', 4, 8) === 'trak' && part.includes(Buffer.from('vide')))) parts.push(part); p += size }
    const movie = Buffer.alloc(8); movie.writeUInt32BE(8 + parts.reduce((n, p) => n + p.length, 0)); movie.write('moov', 4)
    return Buffer.concat([source.subarray(0, start), movie, ...parts, source.subarray(end)])
}
function m4a(bytes: Buffer) { const parser = new Mp4StreamValidator(bytes.length, true); for (let i = 0; i < bytes.length; i += 7) parser.push(bytes.subarray(i, i + 7)); parser.finish() }
describe('bounded standalone audio validation', () => {
    it('accepts complete MPEG Layer III frames at arbitrary boundaries without buffering payload', () => { const bytes = Buffer.concat([frame(), frame()]); for (const n of [1,3,4,10,512,8192]) expect(() => mp3(bytes,n)).not.toThrow() })
    it('accepts optional bounded ID3v2 metadata', () => { const tag = Buffer.from([73,68,51,4,0,0,0,0,0,3,1,2,3]); for (const n of [1,7,8192]) expect(() => mp3(Buffer.concat([tag,frame(),frame()]),n)).not.toThrow() })
    it('rejects truncation, renamed files, free bitrate, oversized tags and trailing executables', () => {
        const bytes = Buffer.concat([frame(),frame()]); const free = Buffer.from(bytes); free[2] = 0
        for (const b of [bytes.subarray(0,bytes.length-1),Buffer.from('MZ executable'),free,Buffer.concat([bytes,Buffer.from('MZ executable')]),Buffer.from([73,68,51,4,0,0,127,127,127,127])]) expect(() => mp3(b)).toThrow()
    })
    it('accepts audio-only AAC-LC M4A and refuses a video disguised as audio', () => { expect(() => m4a(audioMovie())).not.toThrow(); expect(() => m4a(readFileSync('lib/academy/__tests__/fixtures/mp4/test-1s.mp4'))).toThrow('unsupported_mp4_tracks') })
    it('retains sample bounds/codec guards for audio containers', () => { const bytes = audioMovie(); bytes.write('ac-3',bytes.indexOf('mp4a')); expect(() => m4a(bytes)).toThrow('unsupported_mp4_codec'); expect(() => m4a(audioMovie().subarray(0,100))).toThrow() })
})
