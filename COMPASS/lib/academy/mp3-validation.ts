import { MaterialRejected } from './material-validation'

/** MPEG Layer III stream, with an optional bounded initial ID3v2 tag.
 * Only a ten-byte header is retained; payload never drives allocation. */
export class Mp3StreamValidator {
    private header: Buffer = Buffer.alloc(0)
    private remaining = 0
    private total = 0
    private frames = 0
    private first = true
    constructor(private readonly expectedSize: number) {
        if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > 512 * 1024 ** 2) throw new MaterialRejected('invalid_mp3')
    }
    push(chunk: Buffer) {
        this.total += chunk.length
        if (this.total > this.expectedSize) throw new MaterialRejected('invalid_mp3')
        let offset = 0
        while (offset < chunk.length) {
            if (this.remaining) { const n = Math.min(this.remaining, chunk.length - offset); this.remaining -= n; offset += n; continue }
            const needed = this.first && (this.header.length < 3 || this.header.toString('ascii', 0, 3) === 'ID3') ? 10 : 4
            const n = Math.min(needed - this.header.length, chunk.length - offset)
            this.header = Buffer.concat([this.header, chunk.subarray(offset, offset + n)])
            offset += n
            if (this.first && this.header.length >= 3 && this.header.toString('ascii', 0, 3) !== 'ID3' && this.header.length > 4) {
                // Reprocess excess bytes when the initial stream has no tag.
                const extra = this.header.subarray(4); this.header = this.header.subarray(0, 4)
                this.frame(); this.first = false
                this.total -= extra.length; this.push(extra); continue
            }
            if (this.header.length < needed) continue
            if (this.first && this.header.toString('ascii', 0, 3) === 'ID3') {
                const h = this.header
                if (![2, 3, 4].includes(h[3]) || h[4] === 255 || (h[5] & (h[3] === 4 ? 15 : h[3] === 3 ? 31 : 63)) || h.subarray(6).some(v => v > 127)) throw new MaterialRejected('invalid_mp3')
                this.remaining = h[6] * 2097152 + h[7] * 16384 + h[8] * 128 + h[9] + (h[3] === 4 && (h[5] & 16) ? 10 : 0)
                if (this.remaining > 8 * 1024 ** 2) throw new MaterialRejected('mp3_metadata_limit')
                this.header = Buffer.alloc(0)
            } else this.frame()
            this.first = false
        }
    }
    private frame() {
        const h = this.header
        const version = (h[1] >> 3) & 3, layer = (h[1] >> 1) & 3, rate = h[2] >> 4, frequency = (h[2] >> 2) & 3
        if (h[0] !== 255 || (h[1] & 224) !== 224 || version === 1 || layer !== 1 || rate === 0 || rate === 15 || frequency === 3 || (h[3] & 3) === 2) throw new MaterialRejected('invalid_mp3')
        const bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[rate] * 1000
        const sampleRate = [44100,48000,32000][frequency] / (version === 3 ? 1 : version === 2 ? 2 : 4)
        this.remaining = Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate) + ((h[2] >> 1) & 1) - 4
        this.frames++
        this.header = Buffer.alloc(0)
    }
    finish() {
        if (this.total !== this.expectedSize || this.header.length || this.remaining || this.frames < 2) throw new MaterialRejected('incomplete_mp3')
    }
}
