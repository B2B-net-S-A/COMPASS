import { describe, expect, it } from 'vitest'
import {
    createCalendarFeedToken,
    hashCalendarFeedToken,
    isCalendarFeedToken,
    isLegacyCalendarUserId,
} from '../feed-token'

describe('calendar feed tokens', () => {
    it('creates unique 256-bit URL-safe tokens and stores only their hash', () => {
        const first = createCalendarFeedToken()
        const second = createCalendarFeedToken()

        expect(first).not.toBe(second)
        expect(first).toHaveLength(43)
        expect(isCalendarFeedToken(first)).toBe(true)
        expect(hashCalendarFeedToken(first)).toMatch(/^[0-9a-f]{64}$/)
        expect(hashCalendarFeedToken(first)).not.toContain(first)
    })

    it('recognizes old UUID links so the endpoint can return 410', () => {
        expect(isLegacyCalendarUserId('6f9619ff-8b86-4d11-b42d-00cf4fc964ff')).toBe(true)
        expect(isLegacyCalendarUserId('not-a-user-id')).toBe(false)
    })

    it('rejects malformed bearer tokens', () => {
        expect(isCalendarFeedToken('short')).toBe(false)
        expect(isCalendarFeedToken('a'.repeat(42) + '=')).toBe(false)
    })
})
