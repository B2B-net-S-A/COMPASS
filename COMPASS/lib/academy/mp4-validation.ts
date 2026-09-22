import { MaterialRejected } from './material-validation'

// A deliberately narrow progressive MP4 profile. No media payload is retained,
// no URLs/data references are resolved, and declared counts never drive allocation.
const MAX_MOOV = 8 * 1024 ** 2
const MAX_SAMPLES = 1_000_000
const MAX_CHUNKS = 100_000
type Box = { type: string; data: Buffer }
type Range = { start: number; end: number }
function reject(code = 'invalid_mp4_structure'): never { throw new MaterialRejected(code) }
const requireBytes = (data: Buffer, length: number) => { if (data.length < length) reject() }
const u64 = (data: Buffer, offset: number) => {
    requireBytes(data, offset + 8)
    const value = data.readBigUInt64BE(offset)
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) reject()
    return Number(value)
}

function boxes(data: Buffer, offset = 0): Box[] {
    const result: Box[] = []
    while (offset < data.length) {
        if (result.length >= 256 || offset + 8 > data.length) reject()
        const short = data.readUInt32BE(offset)
        const header = short === 1 ? 16 : 8
        const size = short === 1 ? u64(data, offset + 8) : short
        if (size < header || size > data.length - offset) reject()
        result.push({ type: data.toString('latin1', offset + 4, offset + 8), data: data.subarray(offset + header, offset + size) })
        offset += size
    }
    return result
}
function one(items: Box[], type: string): Buffer {
    const matches = items.filter(item => item.type === type)
    if (matches.length !== 1) reject()
    return matches[0].data
}
function table(data: Buffer, width: number, limit = MAX_SAMPLES, version = 0): number {
    requireBytes(data, 8)
    if (data.readUInt32BE(0) !== version * 0x1000000) reject()
    const count = data.readUInt32BE(4)
    if (count > limit || data.length !== 8 + count * width) reject()
    return count
}

function avcConfiguration(data: Buffer) {
    requireBytes(data, 7)
    if (data[0] !== 1 || ![66, 77, 100].includes(data[1])
        || ![10, 11, 12, 13, 20, 21, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52].includes(data[3])
        || (data[4] & 0xfc) !== 0xfc || (data[4] & 3) === 2 || (data[5] & 0xe0) !== 0xe0) reject('unsupported_mp4_codec')
    let offset = 6
    const nal = (kind: number) => {
        requireBytes(data, offset + 2)
        const length = data.readUInt16BE(offset); offset += 2
        if (length < (kind === 7 ? 5 : 2) || length > data.length - offset || (data[offset] & 0x9f) !== kind) reject()
        const payload = data.subarray(offset, offset + length); offset += length
        return payload
    }
    const spsCount = data[5] & 31
    if (!spsCount) reject()
    for (let i = 0; i < spsCount; i++) {
        const sps = nal(7)
        if (!sps.subarray(1, 4).equals(data.subarray(1, 4))) reject()
        if (data[1] === 100) {
            // High profile must still use 8-bit 4:2:0, not a browser-incompatible
            // chroma/bit-depth variant hidden behind an avc1 sample entry.
            const rbsp: number[] = []
            for (let j = 4; j < sps.length; j++) {
                if (j >= 6 && sps[j] === 3 && sps[j - 1] === 0 && sps[j - 2] === 0) continue
                rbsp.push(sps[j])
            }
            let bit = 0
            const read = () => { if (bit >= rbsp.length * 8) reject(); return (rbsp[bit >> 3] >> (7 - (bit++ & 7))) & 1 }
            const ue = () => { let zeros = 0; while (!read()) { if (++zeros > 24) reject() }; let value = 1; for (let j = 0; j < zeros; j++) value = value * 2 + read(); return value - 1 }
            if (ue() > 31) reject() // seq_parameter_set_id
            if (ue() !== 1 || ue() !== 0 || ue() !== 0) reject('unsupported_mp4_codec')
        }
    }
    requireBytes(data, offset + 1)
    const ppsCount = data[offset++]
    if (!ppsCount) reject()
    for (let i = 0; i < ppsCount; i++) nal(8)
    if (offset < data.length && data[1] === 100) {
        requireBytes(data, offset + 4)
        if (data[offset++] !== 0xfd || data[offset++] !== 0xf8 || data[offset++] !== 0xf8) reject('unsupported_mp4_codec')
        const extensionCount = data[offset++]
        for (let i = 0; i < extensionCount; i++) nal(13)
    }
    if (offset !== data.length) reject()
}

function descriptors(data: Buffer, offset: number): { tag: number; data: Buffer }[] {
    const result: { tag: number; data: Buffer }[] = []
    while (offset < data.length) {
        if (result.length >= 16) reject()
        const tag = data[offset++]
        let length = 0, terminated = false
        for (let i = 0; i < 4; i++) {
            requireBytes(data, offset + 1)
            const next = data[offset++]; length = length * 128 + (next & 127)
            if (!(next & 128)) { terminated = true; break }
        }
        if (!terminated || length > data.length - offset) reject()
        result.push({ tag, data: data.subarray(offset, offset + length) }); offset += length
    }
    return result
}
function aacConfiguration(data: Buffer) {
    requireBytes(data, 4)
    if (data.readUInt32BE(0) !== 0) reject()
    const es = descriptors(data, 4)
    if (es.length !== 1 || es[0].tag !== 3) reject()
    const elementary = es[0].data; requireBytes(elementary, 3)
    if (elementary[2] !== 0) reject('unsupported_mp4_codec') // no URL/dependency/OCR
    const decoder = descriptors(elementary, 3).filter(item => item.tag === 4)
    if (decoder.length !== 1) reject()
    const config = decoder[0].data; requireBytes(config, 13)
    if (config[0] !== 0x40 || config[1] !== 0x15) reject('unsupported_mp4_codec')
    const specific = descriptors(config, 13).filter(item => item.tag === 5)
    if (specific.length !== 1) reject()
    const asc = specific[0].data; requireBytes(asc, 2)
    const frequency = ((asc[0] & 7) << 1) | (asc[1] >> 7), channels = (asc[1] >> 3) & 15
    if ((asc[0] >> 3) !== 2 || frequency > 12 || channels < 1 || channels > 7 || (asc[1] & 7) !== 0) reject('unsupported_mp4_codec')
    // Explicit backward-compatible SBR/PS changes the declared codec. Plain LC
    // may include a sync extension only when sbrPresentFlag is zero.
    if (asc.length > 2 && (asc.length !== 5 || asc[2] !== 0x56 || asc[3] !== 0xe5 || asc[4] !== 0)) reject('unsupported_mp4_codec')
}

function validateMovie(moov: Buffer, media: Range[]) {
    const movie = boxes(moov)
    if (movie.some(box => box.type === 'mvex')) reject('fragmented_mp4_unsupported')
    const mvhd = one(movie, 'mvhd'); requireBytes(mvhd, mvhd[0] === 1 ? 112 : 100)
    if (![0, 1].includes(mvhd[0]) || !mvhd.readUInt32BE(mvhd[0] === 1 ? 20 : 12)
        || !(mvhd[0] === 1 ? u64(mvhd, 24) : mvhd.readUInt32BE(16))) reject()
    const tracks = movie.filter(box => box.type === 'trak')
    if (tracks.length < 1 || tracks.length > 2) reject('unsupported_mp4_tracks')
    const kinds = new Set<string>(), ids = new Set<number>(), chunks: Range[] = []
    for (const track of tracks) {
        const trak = boxes(track.data), tkhd = one(trak, 'tkhd')
        requireBytes(tkhd, tkhd[0] === 1 ? 96 : 84)
        if (![0, 1].includes(tkhd[0])) reject()
        const id = tkhd.readUInt32BE(tkhd[0] === 1 ? 20 : 12)
        if (!id || ids.has(id)) reject(); ids.add(id)
        const mdia = boxes(one(trak, 'mdia')), handler = one(mdia, 'hdlr'), mdhd = one(mdia, 'mdhd')
        requireBytes(handler, 24); requireBytes(mdhd, mdhd[0] === 1 ? 36 : 24)
        if (![0, 1].includes(mdhd[0])) reject()
        const timescale = mdhd.readUInt32BE(mdhd[0] === 1 ? 20 : 12)
        const duration = mdhd[0] === 1 ? u64(mdhd, 24) : mdhd.readUInt32BE(16)
        if (!timescale || !duration) reject()
        const kind = handler.toString('latin1', 8, 12)
        if (!['vide', 'soun'].includes(kind) || kinds.has(kind)) reject('unsupported_mp4_tracks'); kinds.add(kind)
        const minf = boxes(one(mdia, 'minf')), dref = one(boxes(one(minf, 'dinf')), 'dref')
        requireBytes(dref, 8)
        const references = boxes(dref, 8)
        if (dref.readUInt32BE(0) !== 0 || dref.readUInt32BE(4) !== 1 || references.length !== 1
            || references[0].type !== 'url ' || references[0].data.length !== 4 || references[0].data.readUInt32BE(0) !== 1) reject('external_mp4_reference')
        const sampleTable = boxes(one(minf, 'stbl'))
        if (sampleTable.some(box => ['senc', 'saiz', 'saio'].includes(box.type))) reject('unsupported_mp4_codec')
        if (['ctts', 'stss'].some(type => sampleTable.filter(box => box.type === type).length > 1)) reject()
        const stsd = one(sampleTable, 'stsd'); requireBytes(stsd, 8)
        const entries = boxes(stsd, 8)
        if (stsd.readUInt32BE(0) !== 0 || stsd.readUInt32BE(4) !== 1 || entries.length !== 1) reject()
        const entry = entries[0]; requireBytes(entry.data, 8)
        if (entry.data.readUInt16BE(6) !== 1) reject('external_mp4_reference')
        if (kind === 'vide') {
            if (entry.type !== 'avc1') reject('unsupported_mp4_codec')
            requireBytes(entry.data, 78)
            if (!entry.data.readUInt16BE(24) || !entry.data.readUInt16BE(26)) reject()
            const config = boxes(entry.data, 78)
            if (config.some(box => box.type === 'sinf')) reject('unsupported_mp4_codec')
            avcConfiguration(one(config, 'avcC'))
        } else {
            if (entry.type !== 'mp4a') reject('unsupported_mp4_codec')
            requireBytes(entry.data, 28)
            if (entry.data.readUInt16BE(8) !== 0) reject('unsupported_mp4_codec')
            const config = boxes(entry.data, 28)
            if (config.some(box => box.type === 'sinf')) reject('unsupported_mp4_codec')
            aacConfiguration(one(config, 'esds'))
        }
        const stsz = one(sampleTable, 'stsz'); requireBytes(stsz, 12)
        const fixed = stsz.readUInt32BE(4), count = stsz.readUInt32BE(8)
        if (stsz.readUInt32BE(0) !== 0 || !count || count > MAX_SAMPLES || stsz.length !== 12 + (fixed ? 0 : count * 4)) reject()
        const stts = one(sampleTable, 'stts'), times = table(stts, 8)
        let timedSamples = 0, ticks = 0
        for (let i = 0; i < times; i++) {
            const n = stts.readUInt32BE(8 + i * 8), delta = stts.readUInt32BE(12 + i * 8)
            if (!n || !delta) reject()
            timedSamples += n; ticks += n * delta
            if (timedSamples > count || !Number.isSafeInteger(ticks)) reject()
        }
        if (timedSamples !== count || ticks !== duration) reject()
        for (const composition of sampleTable.filter(box => box.type === 'ctts')) {
            if (![0, 1].includes(composition.data[0])) reject()
            const n = table(composition.data, 8, MAX_SAMPLES, composition.data[0])
            let samples = 0
            for (let i = 0; i < n; i++) samples += composition.data.readUInt32BE(8 + 8 * i)
            if (samples !== count) reject()
        }
        for (const sync of sampleTable.filter(box => box.type === 'stss')) {
            const n = table(sync.data, 4, count); let last = 0
            if (!n) reject()
            for (let i = 0; i < n; i++) { const sample = sync.data.readUInt32BE(8 + 4 * i); if (sample <= last || sample > count) reject(); last = sample }
        }
        const offsets = sampleTable.filter(box => ['stco', 'co64'].includes(box.type))
        if (offsets.length !== 1) reject()
        const offsetData = offsets[0].data, width = offsets[0].type === 'co64' ? 8 : 4
        const chunkCount = table(offsetData, width, MAX_CHUNKS)
        if (!chunkCount || chunks.length + chunkCount > MAX_CHUNKS) reject('mp4_metadata_limit')
        const stsc = one(sampleTable, 'stsc'), runs = table(stsc, 12, chunkCount)
        if (!runs) reject()
        let first = 0
        for (let i = 0; i < runs; i++) {
            const next = stsc.readUInt32BE(8 + i * 12)
            if ((i === 0 && next !== 1) || next <= first || next > chunkCount || !stsc.readUInt32BE(12 + i * 12) || stsc.readUInt32BE(16 + i * 12) !== 1) reject()
            first = next
        }
        let sample = 0, run = 0
        for (let chunk = 1; chunk <= chunkCount; chunk++) {
            if (run + 1 < runs && stsc.readUInt32BE(8 + (run + 1) * 12) === chunk) run++
            const n = stsc.readUInt32BE(12 + run * 12)
            if (sample + n > count) reject()
            const start = width === 8 ? u64(offsetData, 8 + (chunk - 1) * 8) : offsetData.readUInt32BE(8 + (chunk - 1) * 4)
            let size = 0
            for (let i = 0; i < n; i++) { const next = fixed || stsz.readUInt32BE(12 + sample * 4); if (!next) reject(); size += next; sample++ }
            const end = start + size
            if (!Number.isSafeInteger(end) || !media.some(range => start >= range.start && end <= range.end)) reject('incomplete_mp4_samples')
            chunks.push({ start, end })
        }
        if (sample !== count) reject()
    }
    if (!kinds.has('vide')) reject('unsupported_mp4_tracks')
    chunks.sort((a, b) => a.start - b.start)
    for (let i = 1; i < chunks.length; i++) if (chunks[i].start < chunks[i - 1].end) reject('overlapping_mp4_samples')
}

/** Validates bytes in the same pass as AV/hash. finish() is mandatory before ACK. */
export class Mp4StreamValidator {
    private offset = 0
    private header: Buffer = Buffer.alloc(0)
    private current: { type: string; remaining: number; bytes: Buffer | null; written: number } | null = null
    private moov: Buffer | null = null
    private ftyp = false
    private boxCount = 0
    private readonly media: Range[] = []
    constructor(private readonly expectedSize: number) {
        if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > 1024 ** 3) reject()
    }
    push(chunk: Buffer) {
        if (chunk.length > this.expectedSize - this.offset) reject()
        let position = 0
        while (position < chunk.length) {
            if (!this.current) {
                const needed = this.header.length >= 8 && this.header.readUInt32BE(0) === 1 ? 16 : 8
                const n = Math.min(needed - this.header.length, chunk.length - position)
                this.header = Buffer.concat([this.header, chunk.subarray(position, position + n)])
                position += n; this.offset += n
                if (this.header.length < needed || (needed === 8 && this.header.readUInt32BE(0) === 1)) continue
                const start = this.offset - needed, short = this.header.readUInt32BE(0)
                const type = this.header.toString('latin1', 4, 8)
                const size = short === 1 ? u64(this.header, 8) : short === 0 ? this.expectedSize - start : short
                if (++this.boxCount > 256 || size < needed || size > this.expectedSize - start || (short === 0 && type !== 'mdat')) reject()
                if (['moof', 'mfra', 'styp'].includes(type)) reject('fragmented_mp4_unsupported')
                if (!['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pdin'].includes(type)) reject('unsupported_mp4_structure')
                if (type === 'ftyp' && (this.ftyp || start !== 0 || size > 4096)) reject()
                if (type === 'moov' && (this.moov || size > MAX_MOOV)) reject('mp4_metadata_limit')
                if (type === 'mdat') {
                    if (size === needed || this.media.length >= 128) reject()
                    this.media.push({ start: this.offset, end: start + size })
                }
                this.current = { type, remaining: size - needed, bytes: ['moov', 'ftyp'].includes(type) ? Buffer.alloc(size - needed) : null, written: 0 }
                this.header = Buffer.alloc(0)
            }
            const box = this.current, n = Math.min(box.remaining, chunk.length - position)
            if (box.bytes) chunk.copy(box.bytes, box.written, position, position + n)
            box.written += n; box.remaining -= n; position += n; this.offset += n
            if (box.remaining === 0) {
                if (box.type === 'moov') this.moov = box.bytes
                if (box.type === 'ftyp') {
                    const data = box.bytes!; requireBytes(data, 8)
                    if (data.length % 4 !== 0 || !['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'avc1', 'mp41', 'mp42', 'M4V '].includes(data.toString('latin1', 0, 4))) reject()
                    this.ftyp = true
                }
                this.current = null
            }
        }
    }
    finish() {
        if (this.offset !== this.expectedSize || this.current || this.header.length || !this.ftyp || !this.moov || !this.media.length) reject('incomplete_mp4')
        validateMovie(this.moov, this.media)
    }
}
