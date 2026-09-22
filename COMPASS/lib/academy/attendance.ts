export interface AttendanceInterval { start: string; end: string }
export interface AttendanceRecord {
    id?: string
    emailAddress?: string
    identity?: { id?: string; tenantId?: string }
    role?: string
    intervals: AttendanceInterval[]
}
export interface AttendanceReport {
    id: string
    startDateTime: string
    endDateTime: string
    records: AttendanceRecord[]
}
export interface AttendanceParticipant {
    profileId: string
    /** Only verified identities/addresses from the trusted server-side roster. */
    identities: Array<{ tenantId: string; objectId: string }>
    verifiedEmails: string[]
}
export type AttendanceMatch = { status: 'matched'; profileId: string; method: 'identity' | 'email' }
    | { status: 'unmatched' | 'ambiguous' }
export interface AttendanceDecision {
    profileId: string
    attendedSeconds: number
    requiredSeconds: number
    percentage: number
    status: 'present' | 'insufficient' | 'needs_review'
    reportIds: string[]
}
export interface AttendanceEvaluation {
    decisions: AttendanceDecision[]
    unmatched: Array<{ reportId: string; recordIndex: number; reason: 'unmatched' | 'ambiguous' | 'invalid_intervals' }>
}

function normalized(value: string): string { return value.trim().toLowerCase() }
function validInterval(interval: AttendanceInterval): boolean {
    return Number.isFinite(Date.parse(interval.start)) && Number.isFinite(Date.parse(interval.end))
        && Date.parse(interval.end) > Date.parse(interval.start)
}

/** No name-based matching. Conflicting verified identity/email bindings require human review. */
export function matchAttendanceRecord(record: AttendanceRecord, participants: AttendanceParticipant[]): AttendanceMatch {
    const identityMatches = new Set<string>()
    const emailMatches = new Set<string>()
    for (const participant of participants) {
        if (record.identity?.id && record.identity.tenantId && participant.identities.some(identity =>
            normalized(identity.objectId) === normalized(record.identity!.id!)
            && normalized(identity.tenantId) === normalized(record.identity!.tenantId!))) identityMatches.add(participant.profileId)
        if (record.emailAddress && participant.verifiedEmails.some(email => normalized(email) === normalized(record.emailAddress!))) {
            emailMatches.add(participant.profileId)
        }
    }
    const all = new Set([...identityMatches, ...emailMatches])
    if (all.size > 1) return { status: 'ambiguous' }
    if (identityMatches.size === 1) return { status: 'matched', profileId: [...identityMatches][0], method: 'identity' }
    if (emailMatches.size === 1) return { status: 'matched', profileId: [...emailMatches][0], method: 'email' }
    return { status: 'unmatched' }
}

/** Union device/reconnect/report intervals before summing; cap at the actual teaching window. */
export function unionAttendanceSeconds(intervals: AttendanceInterval[], window: AttendanceInterval): number {
    if (!validInterval(window)) throw new Error('academy_attendance:invalid_window')
    const from = Date.parse(window.start)
    const to = Date.parse(window.end)
    const ranges = intervals.filter(validInterval)
        .map(interval => [Math.max(from, Date.parse(interval.start)), Math.min(to, Date.parse(interval.end))] as const)
        .filter(([start, end]) => end > start)
        .sort((a, b) => a[0] - b[0])
    let total = 0
    let previousStart = 0
    let previousEnd = 0
    for (const [start, end] of ranges) {
        if (start > previousEnd) {
            total += previousEnd - previousStart
            previousStart = start
            previousEnd = end
        } else previousEnd = Math.max(previousEnd, end)
    }
    return Math.floor((total + previousEnd - previousStart) / 1000)
}

export function evaluateSessionAttendance(input: {
    reports: AttendanceReport[]
    participants: AttendanceParticipant[]
    window: AttendanceInterval
    thresholdPercent: number
}): AttendanceEvaluation {
    const { reports, participants, window, thresholdPercent } = input
    if (!validInterval(window) || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent > 100) {
        throw new Error('academy_attendance:invalid_rule')
    }
    if (new Set(participants.map(p => p.profileId)).size !== participants.length) throw new Error('academy_attendance:duplicate_participant')
    const durationSeconds = (Date.parse(window.end) - Date.parse(window.start)) / 1000
    const requiredSeconds = Math.ceil(durationSeconds * thresholdPercent / 100)
    const intervals = new Map<string, AttendanceInterval[]>()
    const reportIds = new Map<string, Set<string>>()
    const invalidProfiles = new Set<string>()
    const unmatched: AttendanceEvaluation['unmatched'] = []
    // Separate Teams occurrences can share the same onlineMeeting. Ignore reports outside this session.
    for (const report of reports) {
        if (!validInterval({ start: report.startDateTime, end: report.endDateTime })
            || Date.parse(report.endDateTime) <= Date.parse(window.start)
            || Date.parse(report.startDateTime) >= Date.parse(window.end)) continue
        report.records.forEach((record, recordIndex) => {
            const match = matchAttendanceRecord(record, participants)
            if (match.status !== 'matched') {
                unmatched.push({ reportId: report.id, recordIndex, reason: match.status })
                return
            }
            if (!record.intervals.length || record.intervals.some(interval => !validInterval(interval))) {
                invalidProfiles.add(match.profileId)
                unmatched.push({ reportId: report.id, recordIndex, reason: 'invalid_intervals' })
            }
            const existing = intervals.get(match.profileId) ?? []
            existing.push(...record.intervals)
            intervals.set(match.profileId, existing)
            const ids = reportIds.get(match.profileId) ?? new Set<string>()
            ids.add(report.id)
            reportIds.set(match.profileId, ids)
        })
    }
    return {
        decisions: participants.map(participant => {
            const presentIntervals = intervals.get(participant.profileId)
            const attendedSeconds = unionAttendanceSeconds(presentIntervals ?? [], window)
            return {
                profileId: participant.profileId,
                attendedSeconds,
                requiredSeconds,
                percentage: Math.min(100, Math.round(attendedSeconds / durationSeconds * 10000) / 100),
                // A missing identity/record/report never proves absence.
                status: !presentIntervals || invalidProfiles.has(participant.profileId) ? 'needs_review'
                    : attendedSeconds >= requiredSeconds ? 'present' : 'insufficient',
                reportIds: [...(reportIds.get(participant.profileId) ?? [])].sort(),
            }
        }),
        unmatched,
    }
}
