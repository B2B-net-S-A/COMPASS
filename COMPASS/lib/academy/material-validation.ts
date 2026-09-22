import { inflateRawSync } from 'node:zlib'

export class MaterialRejected extends Error {
    constructor(public readonly code: string) { super(code); this.name = 'MaterialRejected' }
}

/** Bound archive inflation before reading XML. ZIP64/encrypted packages are rejected. */
export function checkOfficeArchiveLimits(bytes: Buffer) {
    let end = -1
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break }
    }
    if (end < 0) throw new MaterialRejected('invalid_office_archive')
    const count = bytes.readUInt16LE(end + 10)
    const centralSize = bytes.readUInt32LE(end + 12)
    let offset = bytes.readUInt32LE(end + 16)
    if (count > 10000 || count === 65535 || offset + centralSize !== end || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new MaterialRejected('unsupported_office_archive')
    const centralStart = offset
    const entries = new Map<string, { start: number; end: number; method: number; size: number }>()
    let total = 0
    for (let i = 0; i < count; i++) {
        if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new MaterialRejected('invalid_office_archive')
        const flags = bytes.readUInt16LE(offset + 8)
        const inflated = bytes.readUInt32LE(offset + 24)
        const nameLength = bytes.readUInt16LE(offset + 28)
        const extraLength = bytes.readUInt16LE(offset + 30)
        const commentLength = bytes.readUInt16LE(offset + 32)
        const next = offset + 46 + nameLength + extraLength + commentLength
        if (flags & 1 || next > end || inflated > 25 * 1024 ** 2) throw new MaterialRejected('unsafe_office_archive')
        total += inflated
        if (total > 200 * 1024 ** 2) throw new MaterialRejected('office_archive_too_large')
        const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
        if (/(^|[\/])\.\.([\/]|$)|^[/\\]|vbaProject|activeX|embeddings\/|\.(exe|dll|com|js|vbs|ps1|bat|cmd)$/i.test(name)) throw new MaterialRejected('active_office_content')
        if (name === '[Content_Types].xml' && inflated > 1024 ** 2) throw new MaterialRejected('office_manifest_too_large')
        const local = bytes.readUInt32LE(offset + 42)
        const compressed = bytes.readUInt32LE(offset + 20)
        const method = bytes.readUInt16LE(offset + 10)
        if (entries.has(name) || local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50
            || ![0, 8].includes(method) || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) & 1) throw new MaterialRejected('invalid_office_archive')
        const localNameLength = bytes.readUInt16LE(local + 26)
        const start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28)
        if (start + compressed > centralStart || bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name) throw new MaterialRejected('invalid_office_archive')
        entries.set(name, { start, end: start + compressed, method, size: inflated })
        offset = next
    }
    if (offset !== end) throw new MaterialRejected('invalid_office_archive')
    return entries
}

export async function validateMaterialFormat(mimeType: string, prefix: Buffer, document?: Buffer): Promise<void> {
    if (mimeType === 'video/mp4') {
        if (prefix.length < 16 || prefix.toString('ascii', 4, 8) !== 'ftyp' || prefix.readUInt32BE(0) < 16
            || !['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'avc1', 'mp41', 'mp42', 'M4V '].includes(prefix.toString('ascii', 8, 12))) throw new MaterialRejected('invalid_mp4')
        return
    }
    if (!document || document.length > 50 * 1024 ** 2) throw new MaterialRejected('invalid_document_size')
    if (mimeType === 'application/pdf') {
        if (!prefix.subarray(0, 8).toString('ascii').match(/^%PDF-1\.[0-9]|^%PDF-2\.0/)
            || !document.subarray(Math.max(0, document.length - 2048)).includes(Buffer.from('%%EOF'))) throw new MaterialRejected('invalid_pdf')
        return
    }
    if (mimeType === 'text/vtt') {
        let text: string
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(document) } catch { throw new MaterialRejected('invalid_vtt_encoding') }
        if (!/^\uFEFF?WEBVTT(?:[ \t].*)?\r?\n/.test(text)) throw new MaterialRejected('invalid_vtt')
        return
    }
    const type = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'word'
        : mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ? 'ppt' : null
    if (!type) throw new MaterialRejected('unsupported_type')
    const entries = checkOfficeArchiveLimits(document)
    const manifest = entries.get('[Content_Types].xml')
    const mainFile = type === 'word' ? 'word/document.xml' : 'ppt/presentation.xml'
    if (!manifest || !entries.has(mainFile)) throw new MaterialRejected('invalid_office_format')
    const compressed = document.subarray(manifest.start, manifest.end)
    let bytes: Buffer
    try {
        // Bound actual output, irrespective of attacker-controlled ZIP size metadata.
        bytes = manifest.method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1024 ** 2 }) : compressed
    } catch { throw new MaterialRejected('invalid_or_oversized_office_manifest') }
    if (bytes.length > 1024 ** 2 || bytes.length !== manifest.size) throw new MaterialRejected('invalid_or_oversized_office_manifest')
    const xml = bytes.toString('utf8')
    const expected = type === 'word' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'
    if (!xml.includes(expected) || /macroEnabled|vbaProject|activeX/i.test(xml)) throw new MaterialRejected('active_office_content')
}
