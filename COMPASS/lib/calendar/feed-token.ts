import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createCalendarFeedToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashCalendarFeedToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isCalendarFeedToken(token: string): boolean {
    return TOKEN_PATTERN.test(token)
}

export function isLegacyCalendarUserId(token: string): boolean {
    return UUID_PATTERN.test(token)
}
