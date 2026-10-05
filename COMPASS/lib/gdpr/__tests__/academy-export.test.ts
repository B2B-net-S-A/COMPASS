import { describe, expect, it } from 'vitest'
import { subjectEditionSurveyRow, subjectTeachingInterestRow, subjectWebinarRosterRow, subjectWebinarAttendanceRow, parseAttendanceRosterRows, subjectAcademyAuditRow, subjectCompletionRow, subjectTeamsReportRows } from '../academy-export'

const USER = '11111111-1111-4111-8111-111111111111'

describe('Academy subject export projections', () => {
    it('keeps completion proof but excludes reviewer, reason and arbitrary snapshot fields', () => {
        const row = subjectCompletionRow({ id: 'completion', enrollment_id: 'enrollment', user_id: USER,
            course_id: 'course', version_id: 'version', completed_at: '2026-09-23T10:00:00Z', revoked_at: '2026-09-23T11:00:00Z', legacy: false,
            revoked_by: 'other-admin', revoked_reason: 'Mentions another employee',
            certificate_snapshot: { course_title: 'Training', participant_name: 'Learner', version_number: 2,
                completed_at: '2026-09-23T10:00:00Z', certificate_hash: 'hash', author_name: 'Other person',
                arbitrary_nested: { email: 'other@example.com' } },
        }, USER)
        expect(row).toEqual({ id: 'completion', enrollment_id: 'enrollment', user_id: USER,
            course_id: 'course', version_id: 'version', completed_at: '2026-09-23T10:00:00Z', revoked_at: '2026-09-23T11:00:00Z', legacy: false,
            certificate_snapshot: { course_title: 'Training', participant_name: 'Learner', version_number: 2,
                completed_at: '2026-09-23T10:00:00Z', certificate_hash: 'hash' } })
        expect(JSON.stringify(row)).not.toContain('other@example.com')
        expect(subjectCompletionRow({ user_id: 'other', certificate_snapshot: {} }, USER)).toBeNull()
    })

    it('never copies an unreviewed field from audit JSON or an event about another person', () => {
        const own = subjectAcademyAuditRow({ id: 'event', action: 'COURSE_STAFF_CHANGED', course_id: 'course', created_at: 'today',
            details: { user_id: USER, role: 'facilitator', enabled: true, other_employee_email: 'other@example.com' } }, USER)
        expect(own).toEqual({ id: 'event', action: 'COURSE_STAFF_CHANGED', course_id: 'course', created_at: 'today',
            details: { user_id: USER, role: 'facilitator', enabled: true } })
        expect(subjectAcademyAuditRow({ action: 'ACADEMY_IDENTITY_VERIFIED', details: { user_id: 'other' } }, USER)).toBeNull()
        expect(subjectAcademyAuditRow({ action: 'ACADEMY_INTEGRATION_FAILED', details: { user_id: USER } }, USER)).toBeNull()
    })

    it('projects identity matches with corroborating email without copying third-party report fields', () => {
        const participants = [
            { profileId: USER, identities: [{ tenantId: 'tenant', objectId: 'object' }], verifiedEmails: ['own@example.com'] },
            { profileId: 'other', identities: [{ tenantId: 'tenant', objectId: 'other' }], verifiedEmails: ['other@example.com'] },
        ]
        const report = { session_id: 'session', report_id: 'report', imported_at: 'today', evidence: {
            records: [
                { id: 'own', emailAddress: 'own@example.com', identity: { tenantId: 'TENANT', id: 'OBJECT' }, intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }], secret: 'x' },
                { id: 'other', emailAddress: 'other@example.com', identity: { tenantId: 'tenant', id: 'other' }, intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }] },
                { id: 'email-only', emailAddress: 'own@example.com', intervals: [{ start: '2026-09-23T11:00:00Z', end: '2026-09-23T11:15:00Z' }] },
            ], organizer: { email: 'organizer@example.com' },
        } }
        const result = subjectTeamsReportRows(report, participants, USER)
        expect(result.rows).toEqual([
            { session_id: 'session', report_id: 'report', imported_at: 'today', intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }] },
        ])
        expect(result.needsReview).toBe(true) // email-only record needs human attribution
        expect(JSON.stringify(result.rows)).not.toContain('other@example.com')
        expect(JSON.stringify(result.rows)).not.toContain('organizer@example.com')
        const conflictingEmail = { ...report, evidence: { records: [{
            identity: { tenantId: 'tenant', id: 'object' }, emailAddress: 'other@example.com',
            intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }],
        }] } }
        expect(subjectTeamsReportRows(conflictingEmail, participants, USER)).toEqual({ rows: [], needsReview: true })
        const unverifiedEmail = { ...report, evidence: { records: [{ identity: { tenantId: 'tenant', id: 'object' },
            emailAddress: 'unverified@example.com', intervals: [{ start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' }] }] } }
        expect(subjectTeamsReportRows(unverifiedEmail, participants, USER)).toEqual({ rows: [], needsReview: true })
        const sharedEmail = [{ ...participants[0] }, { ...participants[1], verifiedEmails: ['own@example.com'] }]
        expect(subjectTeamsReportRows(report, sharedEmail, USER).needsReview).toBe(true)
    })

    it('rejects incomplete, duplicate and oversized rosters', () => {
        const row = { session_id: 'session', participants: [{ profileId: USER, identities: [], verifiedEmails: ['own@example.com'] }] }
        expect(parseAttendanceRosterRows([row], ['session'])?.get('session')).toHaveLength(1)
        expect(parseAttendanceRosterRows([], ['session'])).toBeNull()
        expect(parseAttendanceRosterRows([row, row], ['session'])).toBeNull()
        expect(parseAttendanceRosterRows([{ ...row, participants: [row.participants[0], row.participants[0]] }], ['session'])).toBeNull()
        expect(parseAttendanceRosterRows([{ ...row, participants: Array.from({ length: 501 }, (_, i) => ({ profileId: String(i), identities: [], verifiedEmails: [] })) }], ['session'])).toBeNull()
    })
})

describe('Training cycle GDPR subject projections', () => {
    it('rejects cross-subject webinar mappings and discards source/batch operator data', () => {
        const row={id:'own',user_id:USER,contractor_id:'contract-own',email:'own@example.com',aliases:['own-alias@example.com'],full_name:'Own',created_by:'other-admin',preview:{email:'other@example.com'}}
        const own=subjectWebinarRosterRow(row,{userId:USER,contractorIds:['contract-own']})
        expect(own).toMatchObject({id:'own',email:'own@example.com'})
        expect(JSON.stringify(own)).not.toContain('other')
        expect(subjectWebinarRosterRow({...row,user_id:'other'}, {userId:USER,contractorIds:['contract-own']})).toBeNull()
        expect(subjectWebinarRosterRow({...row,contractor_id:'other-contractor'}, {userId:USER,contractorIds:['contract-own']})).toBeNull()
        expect(subjectWebinarRosterRow({...row,user_id:null}, {userId:null,contractorIds:['contract-own']})).not.toBeNull()
        expect(subjectWebinarAttendanceRow({roster_id:'other',session_id:'s'},new Set(['own']))).toBeNull()
        expect(subjectWebinarAttendanceRow({roster_id:'own',session_id:'s',attended_seconds:10,imported_by:'other',batch_id:'all-users'},new Set(['own']))).toEqual({roster_id:'own',session_id:'s',attended_seconds:10})
    })
    it('projects own edition answers and declaration while excluding another respondent and unreviewed snapshot', () => {
        expect(subjectEditionSurveyRow({id:'r',user_id:USER,overall:5,question_snapshot:{other_email:'other@example.com'}},USER)).toEqual({id:'r',user_id:USER,overall:5})
        expect(subjectEditionSurveyRow({id:'other',user_id:'other'},USER)).toBeNull()
        expect(subjectTeachingInterestRow({response_id:'r',user_id:USER,willing_to_teach:true,proposed_topic:'Pega',contact_preference:'compass',other:'private'},USER,new Set(['r']))).toEqual({response_id:'r',willing_to_teach:true,proposed_topic:'Pega',contact_preference:'compass'})
        expect(subjectTeachingInterestRow({response_id:'other',user_id:USER},USER,new Set(['r']))).toBeNull()
        expect(subjectTeachingInterestRow({response_id:'r',user_id:'other'},USER,new Set(['r']))).toBeNull()
    })
})
