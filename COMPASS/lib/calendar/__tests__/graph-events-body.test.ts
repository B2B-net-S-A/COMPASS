import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/graph/client', () => ({
    getGraphClient: vi.fn(),
    extractGraphErrorInfo: vi.fn(),
    isRetryableGraphStatus: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

import { buildLeaveEventBody } from '../graph-events'

/** Audyt 2026-09-22, INT-06 — pół dnia urlopu nie blokuje w Outlooku całej doby. */
describe('buildLeaveEventBody', () => {
    const base = {
        userEmail: 'jan@b2bnetwork.pl',
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        leaveType: 'vacation',
        transactionId: 'leave-1',
    }

    it('całodniowy urlop: północ→północ następnego dnia, isAllDay', () => {
        const body = buildLeaveEventBody({ ...base, endDate: '2026-10-14' })
        expect(body.isAllDay).toBe(true)
        expect(body.start.dateTime).toBe('2026-10-12T00:00:00')
        expect(body.end.dateTime).toBe('2026-10-15T00:00:00')
    })

    it('rano: 08:00–12:00 Europe/Warsaw, bez całodniowego bloku', () => {
        const body = buildLeaveEventBody({ ...base, halfDay: 'morning' })
        expect(body.isAllDay).toBe(false)
        expect(body.start).toEqual({ dateTime: '2026-10-12T08:00:00', timeZone: 'Europe/Warsaw' })
        expect(body.end).toEqual({ dateTime: '2026-10-12T12:00:00', timeZone: 'Europe/Warsaw' })
        expect(body.showAs).toBe('oof')
    })

    it('popołudnie: 12:00–16:00', () => {
        const body = buildLeaveEventBody({ ...base, halfDay: 'afternoon' })
        expect(body.isAllDay).toBe(false)
        expect(body.start.dateTime).toBe('2026-10-12T12:00:00')
        expect(body.end.dateTime).toBe('2026-10-12T16:00:00')
    })

    it('half_day na urlopie wielodniowym jest ignorowane (jak w liczeniu puli)', () => {
        const body = buildLeaveEventBody({ ...base, endDate: '2026-10-13', halfDay: 'morning' })
        expect(body.isAllDay).toBe(true)
    })
})
