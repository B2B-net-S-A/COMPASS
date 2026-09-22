// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import JSZip from 'jszip'
import { checkOfficeArchiveLimits, validateMaterialFormat } from '../material-validation'
import { scanWithClamav } from '../clamav'

async function office(extra: Record<string, string> = {}) {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>')
    zip.file('word/document.xml', '<document/>')
    for (const [path, text] of Object.entries(extra)) zip.file(path, text)
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

describe('private material format checks', () => {
    it('accepts a PDF with a real header and trailer', async () => {
        const pdf = Buffer.from('%PDF-1.7\n1 0 obj <</Type /Catalog>> endobj\n%%EOF')
        await expect(validateMaterialFormat('application/pdf', pdf.subarray(0, 64), pdf)).resolves.toBeUndefined()
    })
    it('does not accept a renamed executable or incomplete PDF', async () => {
        for (const text of ['MZ renamed.pdf', '%PDF-1.7 no trailer']) {
            const bytes = Buffer.from(text)
            await expect(validateMaterialFormat('application/pdf', bytes, bytes)).rejects.toThrow('invalid_pdf')
        }
    })
    it('validates an actual Office package and rejects a MIME mismatch', async () => {
        const document = await office()
        await expect(validateMaterialFormat('application/vnd.openxmlformats-officedocument.wordprocessingml.document', document.subarray(0, 64), document)).resolves.toBeUndefined()
        await expect(validateMaterialFormat('application/vnd.openxmlformats-officedocument.presentationml.presentation', document.subarray(0, 64), document)).rejects.toThrow('invalid_office_format')
    })
    it('rejects macros and embedded executables before inflation', async () => {
        for (const path of ['word/vbaProject.bin', 'word/activeX/activeX1.bin', 'word/embeddings/file.exe']) {
            expect(() => checkOfficeArchiveLimits(Buffer.from([]))).toThrow()
            const document = await office({ [path]: 'payload' })
            expect(() => checkOfficeArchiveLimits(document)).toThrow('active_office_content')
        }
    })
    it('rejects archive expansion beyond the bound without inflating it', async () => {
        const document = await office()
        const index = document.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
        document.writeUInt32LE(500 * 1024 ** 2, index + 24)
        expect(() => checkOfficeArchiveLimits(document)).toThrow('unsafe_office_archive')
    })
    it('bounds actual inflation even when ZIP sizes are forged', async () => {
        const document = await office({ '[Content_Types].xml': '<Types>' + 'a'.repeat(2 * 1024 ** 2) + '</Types>' })
        const marker = Buffer.from([0x50, 0x4b, 0x01, 0x02])
        let offset = document.indexOf(marker)
        while (offset >= 0) {
            const length = document.readUInt16LE(offset + 28)
            if (document.subarray(offset + 46, offset + 46 + length).toString() === '[Content_Types].xml') document.writeUInt32LE(100, offset + 24)
            offset = document.indexOf(marker, offset + 4)
        }
        await expect(validateMaterialFormat('application/vnd.openxmlformats-officedocument.wordprocessingml.document', document.subarray(0, 64), document)).rejects.toThrow('invalid_or_oversized_office_manifest')
    })
    it('requires MP4 magic and validates caption encoding/header', async () => {
        const mp4 = Buffer.alloc(24); mp4.writeUInt32BE(24); mp4.write('ftypisom', 4)
        await expect(validateMaterialFormat('video/mp4', mp4)).resolves.toBeUndefined()
        await expect(validateMaterialFormat('video/mp4', Buffer.from('pretend mp4'))).rejects.toThrow('invalid_mp4')
        const vtt = Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nWitaj')
        await expect(validateMaterialFormat('text/vtt', vtt, vtt)).resolves.toBeUndefined()
        await expect(validateMaterialFormat('text/vtt', Buffer.from('HTML'), Buffer.from('HTML'))).rejects.toThrow('invalid_vtt')
        await expect(validateMaterialFormat('text/vtt', Buffer.from([255]), Buffer.from([255]))).rejects.toThrow('invalid_vtt_encoding')
    })
})

async function withScanner(reply: string | null, action: (port: number, received: Buffer[]) => Promise<void>) {
    const received: Buffer[] = []
    const sockets = new Set<Socket>()
    const server = createServer(socket => {
        sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => undefined)
        let buffer = Buffer.alloc(0); let command = false
        socket.on('data', data => {
            buffer = Buffer.concat([buffer, data])
            if (!command) {
                if (buffer.length < 10) return
                expect(buffer.subarray(0, 10).toString()).toBe('zINSTREAM\0')
                buffer = buffer.subarray(10); command = true
            }
            while (buffer.length >= 4) {
                const length = buffer.readUInt32BE(0)
                if (buffer.length < length + 4) return
                if (length === 0) { if (reply !== null) socket.end(reply); return }
                received.push(buffer.subarray(4, 4 + length)); buffer = buffer.subarray(4 + length)
            }
        })
    })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    try { await action((server.address() as { port: number }).port, received) }
    finally { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
async function* source() { yield Buffer.from('first'); yield Buffer.from('second') }

describe('ClamAV INSTREAM transport', () => {
    it('frames all stored bytes and accepts only the complete clean reply', async () => {
        await withScanner('stream: OK\0', async (port, bytes) => {
            await scanWithClamav(source(), { host: '127.0.0.1', port })
            expect(Buffer.concat(bytes).toString()).toBe('firstsecond')
        })
    })
    it.each(['stream: Eicar-Signature FOUND\0', 'stream: scan limit exceeded ERROR\0', 'stream: OK', ''])('fails closed on %j', async reply => {
        await withScanner(reply, async port => { await expect(scanWithClamav(source(), { host: '127.0.0.1', port })).rejects.toThrow() })
    })
    it('terminates a stalled scanner', async () => {
        await withScanner(null, async port => { await expect(scanWithClamav(source(), { host: '127.0.0.1', port, timeoutMs: 40 })).rejects.toThrow() })
    })
})
