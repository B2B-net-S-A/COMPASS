import { describe, it, expect } from 'vitest'
import { shouldPreserveUserOof, type CurrentOofState } from '../graph-oof'

// Phase 25d — preserve user-set OOF instead of overwriting it on leave approval.

const MARKER = '<!-- compass-managed-oof-v1 -->'
const NOW = new Date('2026-06-15T12:00:00Z')

function state(overrides: Partial<CurrentOofState>): CurrentOofState {
    return {
        status: 'disabled',
        scheduledStartDateTime: null,
        scheduledEndDateTime: null,
        internalReplyMessage: null,
        externalReplyMessage: null,
        ...overrides,
    }
}

describe('shouldPreserveUserOof', () => {
    it('returns false when Graph read failed (current=null) — fall back to legacy overwrite', () => {
        expect(shouldPreserveUserOof(null, NOW)).toBe(false)
    })

    it('returns false when status=disabled — no existing OOF to preserve', () => {
        expect(shouldPreserveUserOof(state({ status: 'disabled' }), NOW)).toBe(false)
    })

    it('returns true for alwaysEnabled without Compass marker — user-set permanent OOF', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'alwaysEnabled',
                    internalReplyMessage: '<p>Jestem na długim szkoleniu</p>',
                    externalReplyMessage: '<p>Out of office</p>',
                }),
                NOW,
            ),
        ).toBe(true)
    })

    it('returns false for alwaysEnabled when internal body has Compass marker', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'alwaysEnabled',
                    internalReplyMessage: `${MARKER}\n<p>Jestem na urlopie</p>`,
                    externalReplyMessage: '<p>OOO</p>',
                }),
                NOW,
            ),
        ).toBe(false)
    })

    it('returns false for alwaysEnabled when external body has Compass marker', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'alwaysEnabled',
                    internalReplyMessage: '<p>Compass message</p>',
                    externalReplyMessage: `${MARKER}\n<p>Out of office</p>`,
                }),
                NOW,
            ),
        ).toBe(false)
    })

    it('returns true for scheduled+no-marker with end in the future — user has active OOF', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'scheduled',
                    scheduledEndDateTime: {
                        dateTime: '2026-06-20T00:00:00',
                        timeZone: 'Europe/Warsaw',
                    },
                    internalReplyMessage: '<p>Wracam 20-go</p>',
                    externalReplyMessage: '<p>Back on 20th</p>',
                }),
                NOW,
            ),
        ).toBe(true)
    })

    it('returns false for scheduled+marker even with end in the future — our previous OOF', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'scheduled',
                    scheduledEndDateTime: {
                        dateTime: '2026-06-20T00:00:00',
                        timeZone: 'Europe/Warsaw',
                    },
                    internalReplyMessage: `${MARKER}\n<p>Phase 25 default text</p>`,
                    externalReplyMessage: `${MARKER}\n<p>EN</p>`,
                }),
                NOW,
            ),
        ).toBe(false)
    })

    it('returns false for scheduled+no-marker with end in the past — expired schedule, safe to overwrite', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'scheduled',
                    scheduledEndDateTime: {
                        dateTime: '2026-05-01T00:00:00',
                        timeZone: 'Europe/Warsaw',
                    },
                    internalReplyMessage: '<p>Old vacation</p>',
                }),
                NOW,
            ),
        ).toBe(false)
    })

    it('returns true conservatively when scheduled has no scheduledEndDateTime', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'scheduled',
                    scheduledEndDateTime: null,
                    internalReplyMessage: '<p>Some message</p>',
                }),
                NOW,
            ),
        ).toBe(true)
    })

    it('returns true conservatively when scheduledEndDateTime is unparseable', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'scheduled',
                    scheduledEndDateTime: {
                        dateTime: 'not-a-date',
                        timeZone: 'Europe/Warsaw',
                    },
                    internalReplyMessage: '<p>Message</p>',
                }),
                NOW,
            ),
        ).toBe(true)
    })

    it('returns true conservatively for unknown status values', () => {
        expect(
            shouldPreserveUserOof(
                state({ status: 'futureGraphStatus' as never, internalReplyMessage: '<p>Foo</p>' }),
                NOW,
            ),
        ).toBe(true)
    })

    it('treats UTC tz as UTC (end 1 minute before NOW → expired)', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'scheduled',
                    scheduledEndDateTime: {
                        dateTime: '2026-06-15T11:59:00',
                        timeZone: 'UTC',
                    },
                    internalReplyMessage: '<p>x</p>',
                }),
                NOW,
            ),
        ).toBe(false)
    })

    it('treats UTC tz as UTC (end 1 minute after NOW → still active)', () => {
        expect(
            shouldPreserveUserOof(
                state({
                    status: 'scheduled',
                    scheduledEndDateTime: {
                        dateTime: '2026-06-15T12:01:00',
                        timeZone: 'UTC',
                    },
                    internalReplyMessage: '<p>x</p>',
                }),
                NOW,
            ),
        ).toBe(true)
    })
})
