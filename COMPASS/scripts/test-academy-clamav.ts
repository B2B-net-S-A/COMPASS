// Run only against the disposable hosted-CI daemon, never a production scanner.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { scanWithClamav } from '../lib/academy/clamav'
import { assertClamavReadiness } from '../lib/academy/clamav-readiness'
import { MaterialRejected } from '../lib/academy/material-validation'

const config = { host: '127.0.0.1', port: 13310, timeoutMs: 240_000 }
async function* bytes(value: Uint8Array) { yield value }
async function* gigabyte() {
    // One MiB reused: this verifies a real 1 GiB INSTREAM without a 1 GiB Node allocation.
    const chunk = Buffer.alloc(1024 * 1024, 0x61)
    for (let index = 0; index < 1024; index++) yield chunk
}
async function readiness() {
    let error: unknown
    for (let attempt = 0; attempt < 180; attempt++) {
        try { return await assertClamavReadiness(config) }
        catch (cause) {
            error = cause
            if (cause instanceof Error && !['scanner_unavailable', 'scanner_connection_closed', 'scanner_incomplete_version'].includes(cause.message)) throw cause
            await delay(1000)
        }
    }
    throw error
}

async function main() {
    assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This integration gate is restricted to hosted CI.')
    assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted', 'Do not run a scanner on the local workstation.')
    const mode = process.argv[2]
    assert(['ready', 'baseline', 'limits'].includes(mode), 'Expected ready, baseline or limits mode')
    const loaded = await readiness()
    assert.equal(loaded.engineVersion, '1.4.6')
    if (mode === 'ready') { console.log(JSON.stringify({ readiness: 'passed', ...loaded })); return }
    let checks = 0
    if (mode === 'baseline') {
        await scanWithClamav(bytes(Buffer.from('Compass Academy clean test document.')), config)
        checks++
        // Harmless EICAR antivirus test string, generated in memory rather than stored as a repo fixture.
        const eicar = Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=', 'base64')
        assert.equal(eicar.byteLength, 68)
        await assert.rejects(scanWithClamav(bytes(eicar), config), error => error instanceof MaterialRejected)
        checks++
        const directory = await mkdtemp(join(tmpdir(), 'academy-encrypted-'))
        try {
            const plain = join(directory, 'clean.txt')
            const encrypted = join(directory, 'encrypted.zip')
            await writeFile(plain, 'This harmless encrypted archive must remain unavailable to learners.')
            execFileSync('zip', ['-q', '-j', '-P', 'academy-ci-fixture', encrypted, plain], { stdio: 'pipe' })
            await assert.rejects(scanWithClamav(bytes(await readFile(encrypted)), config), error => error instanceof MaterialRejected)
            checks++
        } finally { await rm(directory, { recursive: true, force: true }) }
        await scanWithClamav(gigabyte(), config)
        checks++
    } else {
        // Same daemon policy, reduced values only: MaxFileSize=1024 and StreamMaxLength=4096.
        await assert.rejects(scanWithClamav(bytes(Buffer.alloc(2048, 0x61)), config), error => error instanceof MaterialRejected)
        checks++
        await assert.rejects(scanWithClamav(bytes(Buffer.alloc(8192, 0x61)), config))
        checks++
    }
    console.log(JSON.stringify({ suite: `academy-clamav-${mode}`, checks, result: 'passed', ...loaded }))
}

main().catch(error => {
    // Deliberately omit raw scanner output, payload bytes and fixture files from logs.
    console.error(error instanceof Error ? error.message : 'ClamAV integration gate failed')
    process.exitCode = 1
})
