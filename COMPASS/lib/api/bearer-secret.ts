import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Porównanie sekretu z nagłówka `Authorization: Bearer …` w stałym czasie.
 *
 * Porównujemy skróty SHA-256, a nie surowe bufory: `timingSafeEqual` wymaga
 * równych długości, a wczesny powrót przy różnej długości zdradzałby długość
 * sekretu. Wyłącznie nagłówek — bez fallbacku na query string, który ląduje
 * w access logach pośredników.
 */
export function bearerSecretMatches(authorization: string | null, secret: string): boolean {
    const provided = authorization?.replace(/^Bearer\s+/i, '') ?? ''
    if (!provided) return false
    const a = createHash('sha256').update(provided).digest()
    const b = createHash('sha256').update(secret).digest()
    return timingSafeEqual(a, b)
}
