import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

// Przepustka konta nauki (B1.3). Token nie niesie adresu: tylko identyfikator konta, cel,
// czas wydania i termin. Podpis HMAC, sekret wyłącznie w vaulcie, bez wartości zapasowej
// na produkcji. Jednorazowość trzyma `last_entry_at` na koncie, więc tokenów nie zapisujemy.

export type LearnerPassPurpose = 'p' | 'r'

export const LEARNER_PASS_TTL_SECONDS = 21 * 24 * 60 * 60
export const LEARNER_REENTRY_TTL_SECONDS = 15 * 60

const TOKEN_VERSION = 'v1'
const MIN_SECRET_LENGTH = 32
const MAX_TOKEN_LENGTH = 200
const CLOCK_SKEW_SECONDS = 60
const TOKEN_PATTERN = /^v1\.([pr])\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{10})\.(\d{10})\.([A-Za-z0-9_-]{43})$/

export interface LearnerPassClaims {
    accountId: string
    purpose: LearnerPassPurpose
    issuedAt: number
    expiresAt: number
}

export type LearnerPassRejection = 'malformed' | 'bad_signature' | 'expired' | 'not_yet_valid'

/** Brak sekretu albo zbyt krótki daje `null`: przepustka po prostu nie działa. */
export function learnerPassSecret(env: NodeJS.ProcessEnv = process.env): string | null {
    const configured = env.ACADEMY_PASS_SECRET?.trim()
    const secret = configured || (env.NODE_ENV !== 'production' ? env.CRON_SECRET?.trim() : undefined)
    return secret && Buffer.byteLength(secret, 'utf8') >= MIN_SECRET_LENGTH ? secret : null
}

function sign(claims: LearnerPassClaims, secret: string): string {
    return createHmac('sha256', secret)
        .update(`academy-pass:${TOKEN_VERSION}:${claims.purpose}:${claims.accountId}:${claims.issuedAt}:${claims.expiresAt}`)
        .digest('base64url')
}

export function createLearnerPassToken(
    input: { accountId: string; purpose: LearnerPassPurpose; ttlSeconds: number; now?: Date },
    secret: string,
): string {
    const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000)
    const claims: LearnerPassClaims = { accountId: input.accountId, purpose: input.purpose, issuedAt, expiresAt: issuedAt + input.ttlSeconds }
    return `${TOKEN_VERSION}.${claims.purpose}.${claims.accountId}.${claims.issuedAt}.${claims.expiresAt}.${sign(claims, secret)}`
}

export function verifyLearnerPassToken(
    token: string,
    secret: string,
    now: Date = new Date(),
): { ok: true; claims: LearnerPassClaims } | { ok: false; reason: LearnerPassRejection } {
    if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'malformed' }
    const match = TOKEN_PATTERN.exec(token)
    if (!match) return { ok: false, reason: 'malformed' }
    const claims: LearnerPassClaims = {
        purpose: match[1] as LearnerPassPurpose,
        accountId: match[2],
        issuedAt: Number(match[3]),
        expiresAt: Number(match[4]),
    }
    const expected = Buffer.from(sign(claims, secret))
    const actual = Buffer.from(match[5])
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: 'bad_signature' }
    const nowSeconds = Math.floor(now.getTime() / 1000)
    if (claims.expiresAt <= nowSeconds) return { ok: false, reason: 'expired' }
    if (claims.issuedAt > nowSeconds + CLOCK_SKEW_SECONDS) return { ok: false, reason: 'not_yet_valid' }
    return { ok: true, claims }
}
