import { describe, expect, it } from 'vitest'
import { evaluateSessionAttendance, matchAttendanceRecord, unionAttendanceSeconds, type AttendanceParticipant, type AttendanceReport } from '../attendance'

const window = { start: '2026-09-22T10:00:00Z', end: '2026-09-22T11:00:00Z' }
const participants: AttendanceParticipant[] = [
    { profileId: 'one', identities: [{ tenantId: 'tenant-a', objectId: 'one-a' }], verifiedEmails: ['one@example.com'] },
    { profileId: 'two', identities: [{ tenantId: 'tenant-b', objectId: 'one-a' }], verifiedEmails: ['two@example.com'] },
]
function report(intervals = [window]): AttendanceReport {
    return { id: 'report', startDateTime: window.start, endDateTime: window.end, records: [{ emailAddress: 'one@example.com', intervals }] }
}

describe('training attendance evidence', () => {
    it('unions reconnects and simultaneous devices, clamping to the teaching window', () => {
        expect(unionAttendanceSeconds([
            { start: '2026-09-22T09:50:00Z', end: '2026-09-22T10:30:00Z' },
            { start: '2026-09-22T10:15:00Z', end: '2026-09-22T10:40:00Z' },
            { start: '2026-09-22T10:50:00Z', end: '2026-09-22T11:10:00Z' },
        ], window)).toBe(3000)
    })
    it('requires tenant and object ID together and supports a different verified email', () => {
        expect(matchAttendanceRecord({ identity: { tenantId: 'tenant-b', id: 'one-a' }, intervals: [] }, participants)).toEqual({ status: 'matched', profileId: 'two', method: 'identity' })
        expect(matchAttendanceRecord({ identity: { id: 'one-a' }, intervals: [] }, participants)).toEqual({ status: 'unmatched' })
        expect(matchAttendanceRecord({ emailAddress: ' ONE@EXAMPLE.COM ', intervals: [] }, participants)).toEqual({ status: 'matched', profileId: 'one', method: 'email' })
    })
    it('rejects conflicting or duplicate identity bindings instead of choosing the first person', () => {
        expect(matchAttendanceRecord({ identity: { tenantId: 'tenant-a', id: 'one-a' }, emailAddress: 'two@example.com', intervals: [] }, participants)).toEqual({ status: 'ambiguous' })
        expect(matchAttendanceRecord({ emailAddress: 'one@example.com', intervals: [] }, [participants[0], { ...participants[1], verifiedEmails: ['one@example.com'] }])).toEqual({ status: 'ambiguous' })
    })
    it('does not count duplicate reports twice and leaves missing people for review', () => {
        const result = evaluateSessionAttendance({ reports: [report(), { ...report(), id: 'report-two' }], participants, window, thresholdPercent: 80 })
        expect(result.decisions[0]).toMatchObject({ status: 'present', attendedSeconds: 3600, requiredSeconds: 2880, percentage: 100 })
        expect(result.decisions[1]).toMatchObject({ status: 'needs_review', attendedSeconds: 0 })
    })
    it('does not treat a missing report as failed attendance', () => {
        expect(evaluateSessionAttendance({ reports: [], participants, window, thresholdPercent: 80 }).decisions.every(d => d.status === 'needs_review')).toBe(true)
    })
    it('compares the exact threshold without rounding a fail into pass', () => {
        const result = evaluateSessionAttendance({ reports: [report([{ start: window.start, end: '2026-09-22T10:47:59Z' }])], participants, window, thresholdPercent: 80 })
        expect(result.decisions[0]).toMatchObject({ status: 'insufficient', attendedSeconds: 2879 })
    })
    it('quarantines invalid evidence and ignores a report for a different session', () => {
        const invalid = report([{ start: window.start, end: '' }])
        const other = { ...report(), id: 'other', startDateTime: '2026-09-21T10:00:00Z', endDateTime: '2026-09-21T11:00:00Z' }
        const result = evaluateSessionAttendance({ reports: [invalid, other], participants, window, thresholdPercent: 80 })
        expect(result.decisions[0].status).toBe('needs_review')
        expect(result.unmatched[0].reason).toBe('invalid_intervals')
    })
})
