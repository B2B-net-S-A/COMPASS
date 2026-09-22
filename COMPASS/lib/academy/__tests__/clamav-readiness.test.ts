import { describe, expect, it } from 'vitest'
import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { assertClamavReadiness, parseClamavVersion } from '../clamav-readiness'

const now=Date.parse('2026-09-22T12:00:00Z')

async function withDaemon(respond: (socket: Socket) => void, verify: (port: number) => Promise<void>) {
    const connections = new Set<Socket>()
    const server = createServer(socket => {
        connections.add(socket)
        socket.once('close', () => connections.delete(socket))
        socket.once('data', () => respond(socket))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('Missing test daemon address')
        await verify(address.port)
    } finally {
        for (const socket of connections) socket.destroy()
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
}

describe('ClamAV readiness',()=>{
    it('reports the loaded fresh database',()=>{
        expect(parseClamavVersion('ClamAV 1.4.6/28000/Tue Sep 22 10:00:00 2026\0',now)).toEqual({
            engineVersion:'1.4.6',databaseVersion:28000,databaseUpdatedAt:'2026-09-22T10:00:00.000Z',
        })
    })
    it('rejects stale, future, incomplete and unsupported engine reports',()=>{
        for(const reply of [
            'ClamAV 1.4.6/28000/Sat Sep 19 10:00:00 2026\0',
            'ClamAV 1.4.6/28000/Wed Sep 23 10:00:00 2026\0',
            'ClamAV 1.4.6/28000/Tue Sep 22 10:00:00 2026',
            'ClamAV 1.4.5/28000/Tue Sep 22 10:00:00 2026\0',
            'ClamAV 1.3.2/28000/Tue Sep 22 10:00:00 2026\0',
            'ClamAV 1.5.3/28000/Tue Sep 22 10:00:00 2026\0',
            'PONG\0',
        ]) expect(()=>parseClamavVersion(reply,now)).toThrow()
    })
    it('reads the loaded version over the daemon protocol before allowing work', async () => {
        const timestamp = new Date().toUTCString().replace(' GMT', '')
        await withDaemon(socket => {
            socket.write('ClamAV 1.4.6/28000/')
            setImmediate(() => socket.end(`${timestamp}\0`))
        }, async port => {
            await expect(assertClamavReadiness({ host: '127.0.0.1', port })).resolves.toMatchObject({
                engineVersion: '1.4.6', databaseVersion: 28000,
            })
        })
    })
    it('fails closed when a reachable daemon has stale signatures or closes without a complete reply', async () => {
        for (const reply of ['ClamAV 1.4.6/28000/Sat Sep 19 10:00:00 2020\0', 'ClamAV 1.4.6/28000/']) {
            await withDaemon(socket => socket.end(reply), async port => {
                await expect(assertClamavReadiness({ host: '127.0.0.1', port })).rejects.toThrow(/scanner_(stale_signatures|incomplete_version)/)
            })
        }
    })
})
