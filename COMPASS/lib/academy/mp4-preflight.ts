/**
 * Cheap structural check run in the browser before a gigabyte upload starts. It reads
 * only box headers and the moov box. The scanner still validates the file in full.
 * Returns a rejection code for materialRejectionMessage, or null when the file may proceed.
 */
const MAX_MOOV = 8 * 1024 ** 2
const MAX_BOXES = 256
const ALLOWED_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'avc1', 'mp41', 'mp42', 'M4V ', 'M4A '])
const UNSUPPORTED_CODECS = ['hvc1', 'hev1', 'av01', 'vp09', 'encv', 'enca']

async function readBytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
    return new Uint8Array(await file.slice(start, end).arrayBuffer())
}
const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...Array.from(bytes.subarray(start, end)))

function contains(haystack: Uint8Array, needle: string): boolean {
    const codes = Array.from(needle, char => char.charCodeAt(0))
    for (let i = 0; i <= haystack.length - codes.length; i++) {
        if (codes.every((code, offset) => haystack[i + offset] === code)) return true
    }
    return false
}

export async function preflightMp4(file: Blob): Promise<string | null> {
    let offset = 0
    let moovAt = -1
    let moovSize = 0
    for (let count = 0; offset < file.size; count++) {
        if (count >= MAX_BOXES) return 'unsupported_mp4_structure'
        const header = await readBytes(file, offset, offset + 16)
        if (header.length < 8) return 'invalid_mp4_structure'
        const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
        const short = view.getUint32(0)
        const type = ascii(header, 4, 8)
        let size = short
        if (short === 1) {
            if (header.length < 16) return 'invalid_mp4_structure'
            size = view.getUint32(8) * 2 ** 32 + view.getUint32(12)
        } else if (short === 0) {
            size = file.size - offset
        }
        if (size < 8 || size > file.size - offset) return 'invalid_mp4_structure'
        if (count === 0) {
            if (type !== 'ftyp' || header.length < 12 || !ALLOWED_BRANDS.has(ascii(header, 8, 12))) return 'invalid_mp4_structure'
        }
        if (['moof', 'mfra', 'styp'].includes(type)) return 'fragmented_mp4_unsupported'
        if (type === 'moov') { moovAt = offset; moovSize = size }
        offset += size
    }
    if (moovAt < 0) return 'incomplete_mp4'
    if (moovSize > MAX_MOOV) return 'mp4_metadata_limit'
    const moov = await readBytes(file, moovAt, moovAt + moovSize)
    if (contains(moov, 'mvex')) return 'fragmented_mp4_unsupported'
    if (UNSUPPORTED_CODECS.some(codec => contains(moov, codec)) || !contains(moov, 'avc1')) return 'unsupported_mp4_codec'
    return null
}
