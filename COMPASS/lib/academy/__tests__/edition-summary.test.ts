import { describe, expect, it } from 'vitest'
import type { AcademyRunDTO, AcademyRunParticipantDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'
import type { WebinarRosterRow } from '../webinar-import'
import { buildEditionSummary } from '../edition-summary'

const now = '2026-10-08T08:00:00Z'
function session(overrides: Partial<AcademySessionDTO> = {}): AcademySessionDTO {
    return {
        id: 'live', runId: 'edition', title: 'Cybersecurity', startsAt: '2026-10-07T16:00:00Z',
        endsAt: '2026-10-07T19:00:00Z', timeZone: 'Europe/Warsaw', mode: 'external_link', required: true,
        status: 'scheduled', joinUrl: null, syncStatus: 'ready', organizerId: null,
        actualStartsAt: '2026-10-07T16:00:00Z', actualEndsAt: '2026-10-07T19:00:00Z',
        attendanceWindowConfirmed: true, ...overrides,
    }
}
function run(confirmedCount: number, overrides: Partial<AcademyRunDTO> = {}): AcademyRunDTO {
    return {
        id: 'edition', courseId: 'course', versionId: 'version', versionNumber: 1, courseTitle: 'Cybersecurity',
        courseSlug: 'cybersecurity', title: 'Cybersecurity 07.10.2026', capacity: 100, status: 'published',
        confirmedCount, waitlistCount: 0, canManage: true, canPublish: true, myRegistration: null,
        sessions: [session()], ...overrides,
    }
}
function participant(userId: string, overrides: Partial<AcademyRunParticipantDTO> = {}): AcademyRunParticipantDTO {
    return {
        registrationId: 'registration-' + userId, userId, enrollmentId: 'enrollment-' + userId,
        fullName: 'Consultant', email: userId + '@example.test', status: 'confirmed', completedAt: null,
        completionState: 'pending', completionRevokedAt: null, progress: null,
        attendance: [{ sessionId: 'live', status: 'present', attendedSeconds: 10800, source: 'teams', note: null }],
        ...overrides,
    }
}
function rosterPerson(id: string, userId: string | null = null, overrides: Partial<WebinarRosterRow> = {}): WebinarRosterRow {
    return {
        id, userId, email: id + '@example.test', fullName: 'Consultant', contractualEmail: null,
        status: 'confirmed', match: userId ? 'matched' : 'unmatched', registrationStatus: userId ? 'confirmed' : null,
        attendance: [{ sessionId: 'live', status: 'present', attendedSeconds: 10800 }], ...overrides,
    }
}

describe('edition summary of the existing webinar and Compass registrations', () => {
    it('counts 96 webinar participants once, including linked registrations and people without Compass', () => {
        const participants = Array.from({ length: 20 }, (_, index) => participant('user-' + index))
        const roster = Array.from({ length: 96 }, (_, index) => rosterPerson('roster-' + index, index < 20 ? 'user-' + index : null))
        const result = buildEditionSummary(run(96), participants, roster, now)
        expect(result).toMatchObject({ registrations: 96, compassRegistrations: 20, webinarOnlyRegistrations: 76, noCompassAccount: 76, waitlisted: 0 })
        expect(result.sessions[0]).toMatchObject({ observed: 96, meetsThreshold: 96, belowThreshold: 0, unverified: 0, observedPercent: 100 })
    })

    it('preserves manual insufficient attendance and missing canonical evidence over imported present copies', () => {
        const participants = [participant('manual', { attendance: [{ sessionId: 'live', status: 'insufficient', attendedSeconds: 600, source: 'manual', note: 'Verified late arrival' }] }), participant('missing', { attendance: [] })]
        const roster = [rosterPerson('copy-manual', 'manual'), rosterPerson('copy-missing', 'missing')]
        const result = buildEditionSummary(run(2), participants, roster, now)
        expect(result.sessions[0]).toMatchObject({ observed: 1, meetsThreshold: 0, belowThreshold: 1, unverified: 1, observedPercent: 50 })
    })

    it('uses roster evidence for a linked account without confirmed Compass admission and counts its waitlist separately', () => {
        const participants = [participant('waiting', { status: 'waitlisted', enrollmentId: null }), participant('cancelled', { status: 'cancelled' })]
        const roster = [rosterPerson('active', 'waiting', { registrationStatus: 'waitlisted' }), rosterPerson('cancelled', null, { status: 'cancelled' })]
        const result = buildEditionSummary(run(1, { waitlistCount: 1 }), participants, roster, now)
        expect(result).toMatchObject({ registrations: 1, compassRegistrations: 0, webinarOnlyRegistrations: 1, noCompassAccount: 0, waitlisted: 1 })
        expect(result.sessions[0]).toMatchObject({ observed: 1, meetsThreshold: 1, unverified: 0 })
    })

    it('does not infer identity from a shared name or email', () => {
        const roster = [rosterPerson('one', null, { email: 'shared@example.test' }), rosterPerson('two', null, { email: 'shared@example.test' })]
        expect(buildEditionSummary(run(2), [], roster, now).registrations).toBe(2)
    })

    it('omits cancelled sessions and includes optional sessions without confusing them with completion', () => {
        const result = buildEditionSummary(run(1, { sessions: [session({ id: 'cancelled', status: 'cancelled' }), session({ id: 'optional', required: false })] }), [participant('one')], [], now)
        expect(result.sessions).toEqual([{ id: 'optional', title: 'Cybersecurity', windowConfirmed: true, observed: 0, meetsThreshold: 0, belowThreshold: 0, unverified: 1, observedPercent: 0 }])
    })

    it.each([
        { attendanceWindowConfirmed: false },
        { actualEndsAt: '2026-10-08T09:00:00Z' },
        { actualEndsAt: null },
        { actualStartsAt: 'invalid' },
    ])('leaves every person unverified until the real completed teaching window is confirmed: %j', overrides => {
        const result = buildEditionSummary(run(1, { sessions: [session(overrides)] }), [participant('one')], [], now)
        expect(result.sessions[0]).toMatchObject({ windowConfirmed: false, observed: 0, meetsThreshold: 0, belowThreshold: 0, unverified: 1, observedPercent: null })
    })

    it('keeps missing and needs-review evidence unverified, while positive seconds are observed separately', () => {
        const roster = [rosterPerson('review', null, { attendance: [{ sessionId: 'live', status: 'needs_review', attendedSeconds: 300 }] }), rosterPerson('missing', null, { attendance: [] }), rosterPerson('zero', null, { attendance: [{ sessionId: 'live', status: 'insufficient', attendedSeconds: 0 }] })]
        const result = buildEditionSummary(run(3), [], roster, now)
        expect(result.sessions[0]).toMatchObject({ observed: 1, meetsThreshold: 0, belowThreshold: 1, unverified: 2, observedPercent: 33.3 })
    })

    it('keeps a zero denominator empty rather than reporting fabricated participation', () => {
        const result = buildEditionSummary(run(0), [], [], now)
        expect(result).toMatchObject({ registrations: 0, compassRegistrations: 0, webinarOnlyRegistrations: 0, noCompassAccount: 0, waitlisted: 0 })
        expect(result.sessions[0]).toMatchObject({ windowConfirmed: true, observed: 0, meetsThreshold: 0, belowThreshold: 0, unverified: 0, observedPercent: null })
    })

    it('fails closed for incomplete confirmed or waitlisted reads and missing transport arrays', () => {
        expect(() => buildEditionSummary(run(96), [], [rosterPerson('only-one')], now)).toThrow(/Niepełne/)
        expect(() => buildEditionSummary(run(0, { waitlistCount: 1 }), [], [], now)).toThrow(/Niepełne/)
        expect(() => buildEditionSummary(run(0), [], undefined as unknown as WebinarRosterRow[], now)).toThrow(/Niepełne/)
    })

    it('rejects conflicting enrollments or duplicate session evidence instead of selecting convenient attendance', () => {
        const one = participant('one')
        expect(() => buildEditionSummary(run(1), [one, participant('one', { enrollmentId: 'other-enrollment' })], [], now)).toThrow(/Niepełne/)
        expect(() => buildEditionSummary(run(1), [participant('one', { attendance: [...one.attendance, ...one.attendance] })], [], now)).toThrow(/Niepełne/)
    })
})
