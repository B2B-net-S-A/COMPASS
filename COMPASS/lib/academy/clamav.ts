import { createConnection } from 'node:net'
import { once } from 'node:events'
import { MaterialRejected } from './material-validation'

export interface ClamavConfig { host: string; port: number; timeoutMs?: number }

/** INSTREAM over a private network only. A missing/partial/error result never means clean. */
export async function scanWithClamav(source: AsyncIterable<Uint8Array>, config: ClamavConfig): Promise<void> {
    const socket = createConnection({ host: config.host, port: config.port })
    const timer = setTimeout(() => socket.destroy(new Error('scanner_timeout')), config.timeoutMs ?? 240_000)
    let reply = ''
    const result = new Promise<void>((resolve, reject) => {
        socket.on('error', () => reject(new Error('scanner_unavailable')))
        socket.on('data', (data: Buffer) => {
            reply += data.toString('utf8')
            if (reply.length > 4096) socket.destroy(new Error('scanner_invalid_response'))
        })
        socket.on('end', () => {
            if (reply === 'stream: OK\0') resolve()
            else if (/^stream: [^\0]+ FOUND\0$/.test(reply)) reject(new MaterialRejected('malware_or_scan_limit'))
            else reject(new Error('scanner_incomplete_result'))
        })
        socket.on('close', () => { if (!socket.readableEnded) reject(new Error('scanner_connection_closed')) })
    })
    // The daemon may reject a stream before the upload loop finishes.
    void result.catch(() => undefined)
    const write = (data: Uint8Array) => new Promise<void>((resolve, reject) => {
        socket.write(data, error => error ? reject(error) : resolve())
    })
    try {
        await once(socket, 'connect')
        await write(Buffer.from('zINSTREAM\0'))
        for await (const chunk of source) {
            const header = Buffer.alloc(4)
            header.writeUInt32BE(chunk.byteLength)
            await write(header)
            await write(chunk)
        }
        await write(Buffer.alloc(4))
        await result
    } finally { clearTimeout(timer); socket.destroy() }
}
