// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkMp4File, MAX_MP4_BYTES } from '../mp4-local-check'

const fixtures = join(process.cwd(), 'lib/academy/__tests__/fixtures/mp4')
const script = join(process.cwd(), 'scripts/academy-normalize-video.sh')
let dir: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'academy-normalizer-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function copy(name: string, target = name) {
    const path = join(dir, target)
    copyFileSync(join(fixtures, name), path)
    return path
}

/** ffmpeg stub: writes the given fixture to the last argument and logs its arguments. */
function run(args: string[], output: string | null, env: Record<string, string> = {}) {
    const bin = join(dir, 'bin')
    spawnSync('mkdir', ['-p', bin])
    writeFileSync(join(bin, 'ffmpeg'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${dir}/ffmpeg.log"\nfor last; do :; done\n${output ? `cp "${output}" "$last"` : 'printf bad > "$last"'}\n`)
    writeFileSync(join(bin, 'ffprobe'), `#!/usr/bin/env bash\ncase "$*" in *format=duration*) echo 7200.5 ;; *) echo 0 ;; esac\n`)
    chmodSync(join(bin, 'ffmpeg'), 0o755)
    chmodSync(join(bin, 'ffprobe'), 0o755)
    return spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env } })
}

describe('checkMp4File', () => {
    it('accepts a real progressive AVC/AAC file', async () => {
        await expect(checkMp4File(join(fixtures, 'test-1s.mp4'))).resolves.toMatchObject({ ok: true })
    })
    it('rejects non-AAC audio with the fixed Polish message', async () => {
        const result = await checkMp4File(join(fixtures, '2x2-green.mp4'))
        expect(result).toMatchObject({ ok: false, code: 'unsupported_mp4_codec' })
        expect(result.ok ? '' : result.message).toContain('H.264')
    })
    it('rejects a truncated file and an empty file', async () => {
        const cut = copy('test-1s.mp4', 'cut.mp4')
        truncateSync(cut, 1000)
        await expect(checkMp4File(cut)).resolves.toMatchObject({ ok: false })
        const empty = join(dir, 'empty.mp4')
        writeFileSync(empty, '')
        await expect(checkMp4File(empty)).resolves.toMatchObject({ ok: false, code: 'incomplete_mp4' })
    })
    it('refuses a file over the limit before reading it and says how to split', async () => {
        const large = join(dir, 'large.mp4')
        writeFileSync(large, '')
        truncateSync(large, MAX_MP4_BYTES + 1)
        const result = await checkMp4File(large)
        expect(result).toMatchObject({ ok: false, code: 'file_too_large' })
        expect(result.ok ? '' : result.message).toContain('--part-minutes')
    })
    it('accepts a file exactly at the limit boundary only if its structure is valid', async () => {
        const boundary = join(dir, 'boundary.mp4')
        writeFileSync(boundary, '')
        truncateSync(boundary, MAX_MP4_BYTES)
        await expect(checkMp4File(boundary)).resolves.toMatchObject({ ok: false })
    }, 30_000)
})

describe('academy-normalize-video.sh', () => {
    it('produces a validated file with the required encoder flags and removes nothing else', () => {
        const input = copy('movie_5.mp4', 'nagranie.mp4')
        const result = run([input], join(fixtures, 'test-1s.mp4'))
        expect(result.status, result.stderr).toBe(0)
        expect(existsSync(join(dir, 'nagranie.normalized.mp4'))).toBe(true)
        expect(existsSync(input)).toBe(true)
        expect(result.stdout).toContain('SharePoint')
        const args = readFileSync(join(dir, 'ffmpeg.log'), 'utf8')
        for (const flag of ['-c:v libx264', '-pix_fmt yuv420p', '-profile:a aac_low', '-movflags +faststart', '-chunk_duration 1000000', '-map_metadata -1']) expect(args).toContain(flag)
    }, 30_000)
    it('leaves no output under the final name when the validator rejects the result', () => {
        const input = copy('movie_5.mp4', 'nagranie.mp4')
        const result = run([input], join(fixtures, '2x2-green.mp4'))
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('ODRZUCONY')
        expect(existsSync(join(dir, 'nagranie.normalized.mp4'))).toBe(false)
        expect(existsSync(join(dir, 'nagranie.normalized.mp4.tmp.mp4'))).toBe(false)
    }, 30_000)
    it('refuses to overwrite an existing normalized file', () => {
        const input = copy('movie_5.mp4', 'nagranie.mp4')
        writeFileSync(join(dir, 'nagranie.normalized.mp4'), 'keep')
        const result = run([input], join(fixtures, 'test-1s.mp4'))
        expect(result.status).not.toBe(0)
        expect(readFileSync(join(dir, 'nagranie.normalized.mp4'), 'utf8')).toBe('keep')
    }, 30_000)
    it('splits into parts covering the whole duration', () => {
        const input = copy('movie_5.mp4', 'nagranie.mp4')
        const result = run(['--part-minutes', '60', input], join(fixtures, 'test-1s.mp4'))
        expect(result.status, result.stderr).toBe(0)
        for (const part of ['part01', 'part02', 'part03']) expect(existsSync(join(dir, `nagranie.${part}.normalized.mp4`))).toBe(true)
        expect(existsSync(join(dir, 'nagranie.part04.normalized.mp4'))).toBe(false)
        expect(readFileSync(join(dir, 'ffmpeg.log'), 'utf8')).toContain('-ss 7200 -t 3600')
    }, 60_000)
    it('never runs on a Coolify host', () => {
        const input = copy('movie_5.mp4', 'nagranie.mp4')
        const result = run([input], join(fixtures, 'test-1s.mp4'), { COOLIFY_FQDN: 'compass.example' })
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('tylko na laptopie')
        expect(existsSync(join(dir, 'ffmpeg.log'))).toBe(false)
    })
    it('rejects a missing file and a non-numeric part length', () => {
        expect(run([join(dir, 'brak.mp4')], null).status).not.toBe(0)
        const input = copy('movie_5.mp4', 'nagranie.mp4')
        expect(run(['--part-minutes', 'abc', input], null).stderr).toContain('liczby całkowitej')
    })
})
