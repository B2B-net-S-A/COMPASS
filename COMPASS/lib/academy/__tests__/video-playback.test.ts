// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasRecovered, MAX_RECOVERY_ATTEMPTS, recoveryDelayMs } from '../video-playback'

describe('recovery policy', () => {
    it('retries at once first and then backs off up to 30 s', () => {
        expect(Array.from({ length: MAX_RECOVERY_ATTEMPTS }, (_, i) => recoveryDelayMs(i + 1))).toEqual([0, 1000, 2000, 4000, 8000, 16000, 30000, 30000])
    })
    it('counts as recovered only after real progress past the failure', () => {
        expect(hasRecovered(100, 100)).toBe(false)
        expect(hasRecovered(100, 104.9)).toBe(false)
        expect(hasRecovered(100, 105)).toBe(true)
        expect(hasRecovered(100, 40)).toBe(false)
    })
})

describe('report-only CSP stays safe to enforce for video', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')
    const policy = config.slice(config.indexOf('const REPORT_ONLY_CSP'), config.indexOf('/** @type'))
    it('allows signed Supabase media and captions', () => {
        expect(policy).toMatch(/media-src 'self' blob: https:/)
    })
    it('allows every iframe host produced by the embed parser', () => {
        const editor = readFileSync(join(process.cwd(), 'components/learning/EmbedVideo.tsx'), 'utf8')
        const hosts = Array.from(new Set(Array.from(editor.matchAll(/embedUrl: `(https:\/\/[^/`]+)\//g), match => match[1])))
        expect(hosts.length).toBeGreaterThanOrEqual(4)
        const frameSrc = policy.match(/frame-src [^"]+/)?.[0] ?? ''
        for (const host of hosts) expect(frameSrc).toContain(host)
    })
})
