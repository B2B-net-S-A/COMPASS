/**
 * Validate the only supported cron credential transport.
 *
 * Query-string credentials are intentionally ignored because URLs are copied
 * into proxy, CDN, browser and observability logs. Requiring the complete
 * Bearer shape also prevents a raw secret in the Authorization header from
 * being accepted accidentally.
 */
export function hasValidCronBearer(
    request: Pick<Request, 'headers'>,
    expectedSecret: string,
): boolean {
    const authorization = request.headers.get('authorization')
    if (!authorization) return false

    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
    if (!match) return false

    const provided = Buffer.from(match[1])
    const expected = Buffer.from(expectedSecret)
    return provided.length === expected.length && timingSafeEqual(provided, expected)
}
import { timingSafeEqual } from 'node:crypto'
