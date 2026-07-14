import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import {
    PulseTokenConfigurationError,
    buildPulseSurveyUrl,
    createPulseToken,
    getPulseTokenSecret,
    hashPulseToken,
    verifyPulseToken,
} from '../pulse-token'

const secret = '12345678901234567890123456789012'

describe('consultant pulse tokens', () => {
    it('creates deterministic signed tokens and stable hashes', () => {
        const first = createPulseToken('request-1', '2026-08-01T00:00:00.000Z', secret)
        const second = createPulseToken('request-1', '2026-08-01T00:00:00.000Z', secret)
        expect(first).toBe(second)
        expect(createPulseToken('request-1', '2026-08-01T02:00:00+02:00', secret)).toBe(first)
        expect(first.split('.')[1]).toHaveLength(43)
        expect(hashPulseToken(first)).toMatch(/^[a-f0-9]{64}$/)
    })

    it('verifies signature and expiry', () => {
        const expiresAt = '2026-08-01T00:00:00.000Z'
        const token = createPulseToken('request-1', expiresAt, secret)
        expect(verifyPulseToken(token, 'request-1', expiresAt, secret, new Date('2026-07-14T00:00:00Z')))
            .toBe(true)
        expect(verifyPulseToken(`${token}x`, 'request-1', expiresAt, secret, new Date('2026-07-14T00:00:00Z')))
            .toBe(false)
        expect(verifyPulseToken(token, 'request-1', expiresAt, secret, new Date('2026-08-01T00:00:00Z')))
            .toBe(false)
    })

    it('uses CRON_SECRET fallback only outside production', () => {
        expect(getPulseTokenSecret({ NODE_ENV: 'test', CRON_SECRET: secret })).toBe(secret)
        expect(() => getPulseTokenSecret({ NODE_ENV: 'production', CRON_SECRET: secret }))
            .toThrow(PulseTokenConfigurationError)
    })

    it('builds the public survey URL without storing a raw token', () => {
        const url = buildPulseSurveyUrl({
            requestId: 'request-1',
            expiresAt: '2026-08-01T00:00:00.000Z',
            secret,
            appUrl: 'https://compass.example/',
        })
        expect(url).toMatch(/^https:\/\/compass\.example\/survey\/consultant-pulse\/request-1\./)
    })
})
