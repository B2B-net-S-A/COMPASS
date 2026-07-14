import 'server-only'

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const MIN_SECRET_LENGTH = 32
const TOKEN_VERSION = 'v1'

export class PulseTokenConfigurationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'PulseTokenConfigurationError'
    }
}

function assertSecret(secret: string): void {
    if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_LENGTH) {
        throw new PulseTokenConfigurationError(
            `CONSULTANT_SUCCESS_TOKEN_SECRET must be at least ${MIN_SECRET_LENGTH} bytes`,
        )
    }
}

function tokenMessage(requestId: string, expiresAt: string): string {
    const canonicalExpiry = new Date(expiresAt).toISOString()
    return `${TOKEN_VERSION}:${requestId}:${canonicalExpiry}`
}

/**
 * Resolve the server-only signing secret. Production deliberately has no
 * fallback; local development and tests may reuse CRON_SECRET for convenience.
 */
export function getPulseTokenSecret(env: NodeJS.ProcessEnv = process.env): string {
    const configured = env.CONSULTANT_SUCCESS_TOKEN_SECRET?.trim()
    const isProduction = env.NODE_ENV === 'production'
    const secret = configured || (!isProduction ? env.CRON_SECRET?.trim() : undefined)
    if (!secret) {
        throw new PulseTokenConfigurationError(
            'CONSULTANT_SUCCESS_TOKEN_SECRET is not configured',
        )
    }
    assertSecret(secret)
    return secret
}

/**
 * Deterministic, 256-bit HMAC token. Determinism lets a dispatcher reconstruct
 * survey links for retries without ever persisting the raw token.
 */
export function createPulseToken(
    requestId: string,
    expiresAt: string,
    secret: string,
): string {
    assertSecret(secret)
    const signature = createHmac('sha256', secret)
        .update(tokenMessage(requestId, expiresAt))
        .digest('base64url')
    return `${requestId}.${signature}`
}

export function hashPulseToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function verifyPulseToken(
    token: string,
    requestId: string,
    expiresAt: string,
    secret: string,
    now = new Date(),
): boolean {
    if (new Date(expiresAt).getTime() <= now.getTime()) return false
    const expected = createPulseToken(requestId, expiresAt, secret)
    const actualBuffer = Buffer.from(token)
    const expectedBuffer = Buffer.from(expected)
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function buildPulseSurveyUrl(options: {
    requestId: string
    expiresAt: string
    secret: string
    appUrl: string
}): string {
    const token = createPulseToken(options.requestId, options.expiresAt, options.secret)
    const base = options.appUrl.replace(/\/$/, '')
    return `${base}/survey/consultant-pulse/${encodeURIComponent(token)}`
}
