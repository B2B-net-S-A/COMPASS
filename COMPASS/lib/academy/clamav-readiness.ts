import { createConnection } from 'node:net'
import type { ClamavConfig } from './clamav'

export interface ClamavReadiness { engineVersion: string; databaseVersion: number; databaseUpdatedAt: string }

/** ClamAV reports the loaded daily database timestamp in VERSION, not merely a TCP heartbeat. */
export function parseClamavVersion(reply: string, now = Date.now(), maxAgeMs = 48 * 60 * 60_000): ClamavReadiness {
    const match = /^ClamAV (\d+\.\d+\.\d+)\/(\d+)\/([^\0\r\n]+)\0$/.exec(reply)
    if (!match || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) throw new Error('scanner_invalid_version')
    const version = match[1].split('.').map(Number)
    // Supported patch floors at integration review; refresh alongside the pinned image.
    if (version[0] < 1 || (version[0] === 1 && (version[1] < 4
        || (version[1] === 4 && version[2] < 6) || (version[1] === 5 && version[2] < 4)))) {
        throw new Error('scanner_unsupported_engine')
    }
    // The scanner image and operational service must run with TZ=Etc/UTC.
    const updatedAt = Date.parse(`${match[3]} UTC`)
    if (!Number.isFinite(updatedAt) || updatedAt > now + 5 * 60_000 || now - updatedAt > maxAgeMs) throw new Error('scanner_stale_signatures')
    return { engineVersion: match[1], databaseVersion: Number(match[2]), databaseUpdatedAt: new Date(updatedAt).toISOString() }
}

/** Call before scanning: an unhealthy container can keep listening, so TCP availability is insufficient. */
export async function assertClamavReadiness(config: ClamavConfig): Promise<ClamavReadiness> {
    const socket = createConnection({ host: config.host, port: config.port })
    const timer = setTimeout(() => socket.destroy(new Error('scanner_readiness_timeout')), 5000)
    let reply = ''
    try {
        return await new Promise<ClamavReadiness>((resolve, reject) => {
            socket.once('connect', () => socket.write('zVERSION\0'))
            socket.once('error', () => reject(new Error('scanner_unavailable')))
            socket.on('data', (data: Buffer) => {
                reply += data.toString('utf8')
                if (reply.length > 1024) socket.destroy(new Error('scanner_invalid_version'))
                if (reply.endsWith('\0')) {
                    try { resolve(parseClamavVersion(reply)) } catch (error) { reject(error) }
                }
            })
            socket.once('end', () => {
                if (!reply.endsWith('\0')) reject(new Error('scanner_incomplete_version'))
            })
            socket.once('close', () => {
                if (!reply.endsWith('\0')) reject(new Error('scanner_connection_closed'))
            })
        })
    } finally { clearTimeout(timer); socket.destroy() }
}
