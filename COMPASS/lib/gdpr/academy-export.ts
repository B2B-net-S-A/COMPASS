import { matchAttendanceRecord, type AttendanceParticipant, type AttendanceRecord } from '@/lib/academy/attendance'

/** Only audit actions whose details.user_id names the data subject. */
export const SUBJECT_ACADEMY_AUDIT_ACTIONS = [
    'ACADEMY_IDENTITY_VERIFIED', 'ACADEMY_IDENTITY_REMOVED',
    'COURSE_STAFF_CHANGED', 'RUN_STAFF_CHANGED',
] as const

export const ACADEMY_EXPORT_FOLLOW_UPS = [
    'Raporty obecności Teams zawierają także innych uczestników: automatycznie udostępniane są wyłącznie wpisy jednoznacznie przypisane do osoby przez jej zweryfikowany identyfikator Microsoft oraz potwierdzoną listę uczestników. Wpisy wyłącznie z adresem e-mail lub niejednoznaczne wymagają ręcznego przeglądu.',
    'Zdarzenia audytu Akademii zapisane jako czynności operatora na cudzych danych wymagają indywidualnego przeglądu; eksport automatyczny obejmuje tylko jawne zdarzenia, w których osoba jest wskazanym podmiotem.',
] as const

type Row = Record<string, unknown>

function object(value: unknown): Row | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
}

/** Certificate snapshots are historical evidence, but their JSON may grow arbitrary fields. */
export function subjectCompletionRow(row: Row, subjectId: string): Row | null {
    if (row.user_id !== subjectId) return null
    const snapshot = object(row.certificate_snapshot)
    const certificateSnapshot: Row = {}
    if (snapshot) {
        for (const key of ['course_title', 'participant_name', 'completed_at', 'certificate_hash']) {
            if (typeof snapshot[key] === 'string') certificateSnapshot[key] = snapshot[key]
        }
        if (typeof snapshot.version_number === 'number' && Number.isSafeInteger(snapshot.version_number)) {
            certificateSnapshot.version_number = snapshot.version_number
        }
    }
    return {
        id: row.id, enrollment_id: row.enrollment_id, user_id: row.user_id,
        course_id: row.course_id, version_id: row.version_id,
        completed_at: row.completed_at, revoked_at: row.revoked_at, legacy: row.legacy,
        certificate_snapshot: certificateSnapshot,
    }
}

/** Audit details may evolve. Export only the currently reviewed subject fields. */
export function subjectAcademyAuditRow(row: Row, subjectId: string): Row | null {
    const action = row.action
    const details = object(row.details)
    if (!details || details.user_id !== subjectId || !SUBJECT_ACADEMY_AUDIT_ACTIONS.includes(action as typeof SUBJECT_ACADEMY_AUDIT_ACTIONS[number])) return null
    const allowed = action === 'ACADEMY_IDENTITY_REMOVED'
        ? ['user_id', 'identity_id', 'tenant_id', 'object_id']
        : action === 'COURSE_STAFF_CHANGED' ? ['user_id', 'role', 'enabled']
            : action === 'RUN_STAFF_CHANGED' ? ['user_id', 'run_id', 'enabled'] : ['user_id']
    return {
        id: row.id, action, course_id: row.course_id, created_at: row.created_at,
        details: Object.fromEntries(allowed.filter(key => Object.hasOwn(details, key)).map(key => [key, details[key]])),
    }
}

/** Reject incomplete or malformed rosters; an omitted participant could make a conflicting Graph binding look unique. */
export function parseAttendanceRosterRows(data: unknown, sessionIds: string[]): Map<string, AttendanceParticipant[]> | null {
    if (!Array.isArray(data) || data.length !== new Set(sessionIds).size) return null
    const requested = new Set(sessionIds)
    const result = new Map<string, AttendanceParticipant[]>()
    for (const raw of data) {
        const row = object(raw)
        if (!row || typeof row.session_id !== 'string' || !requested.has(row.session_id) || result.has(row.session_id)
            || !Array.isArray(row.participants) || row.participants.length > 500) return null
        const participants: AttendanceParticipant[] = []
        const ids = new Set<string>()
        for (const rawParticipant of row.participants) {
            const participant = object(rawParticipant)
            if (!participant || typeof participant.profileId !== 'string' || ids.has(participant.profileId)
                || !Array.isArray(participant.identities) || !Array.isArray(participant.verifiedEmails)
                || participant.identities.length > 100 || participant.verifiedEmails.length > 100
                || !participant.verifiedEmails.every(email => typeof email === 'string')) return null
            const identities = participant.identities.map(object)
            if (identities.some(identity => !identity || typeof identity.tenantId !== 'string' || typeof identity.objectId !== 'string')) return null
            ids.add(participant.profileId)
            participants.push({ profileId: participant.profileId,
                identities: identities.map(identity => ({ tenantId: identity!.tenantId as string, objectId: identity!.objectId as string })),
                verifiedEmails: participant.verifiedEmails })
        }
        result.set(row.session_id, participants)
    }
    return result
}

/** A Graph report includes all attendees. Require the subject's identity; an email may only corroborate it. */
export function subjectTeamsReportRows(report: Row, participants: AttendanceParticipant[], subjectId: string): { rows: Row[]; needsReview: boolean } {
    const evidence = object(report.evidence)
    if (!evidence || !Array.isArray(evidence.records) || evidence.records.length > 500) return { rows: [], needsReview: true }
    const rows: Row[] = []
    let needsReview = false
    for (const rawRecord of evidence.records) {
        const record = object(rawRecord)
        const identity = object(record?.identity)
        if (!record || (record.emailAddress != null && typeof record.emailAddress !== 'string')
            || (record.identity != null && (!identity || typeof identity.tenantId !== 'string' || typeof identity.id !== 'string'))
            || !Array.isArray(record.intervals) || record.intervals.length > 100) { needsReview = true; continue }
        const match = matchAttendanceRecord(record as unknown as AttendanceRecord, participants)
        if (match.status !== 'matched') { needsReview = true; continue }
        if (match.profileId !== subjectId) continue
        const own = participants.find(participant => participant.profileId === subjectId)
        if (match.method !== 'identity' || !own || (typeof record.emailAddress === 'string' && record.emailAddress.trim() !== ''
            && !own.verifiedEmails.some(email => email.trim().toLowerCase() === record.emailAddress!.trim().toLowerCase()))) {
            needsReview = true
            continue
        }
        // No arbitrary Graph fields, participant names, emails, or other records.
        const intervals = record.intervals.flatMap((rawInterval: unknown) => {
            const interval = object(rawInterval)
            return interval && typeof interval.start === 'string' && typeof interval.end === 'string'
                && Number.isFinite(Date.parse(interval.start)) && Number.isFinite(Date.parse(interval.end))
                && Date.parse(interval.end) > Date.parse(interval.start)
                ? [{ start: interval.start, end: interval.end }] : []
        })
        if (intervals.length !== record.intervals.length) { needsReview = true; continue }
        rows.push({ session_id: report.session_id, report_id: report.report_id, imported_at: report.imported_at, intervals })
    }
    return { rows, needsReview }
}
