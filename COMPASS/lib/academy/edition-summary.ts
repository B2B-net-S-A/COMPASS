import type { AcademyRunDTO, AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import type { WebinarRosterRow } from './webinar-import'

export interface EditionSessionSummary {
    id: string
    title: string
    windowConfirmed: boolean
    observed: number
    meetsThreshold: number
    belowThreshold: number
    unverified: number
    observedPercent: number | null
}

export interface EditionSummary {
    registrations: number
    compassRegistrations: number
    webinarOnlyRegistrations: number
    noCompassAccount: number
    waitlisted: number
    sessions: EditionSessionSummary[]
}

const incompleteData = () => new Error('Niepełne lub niespójne dane uczestników edycji. Odśwież raport.')

/** Read-only edition totals. A confirmed Compass registration owns its attendance
 * evidence, including an empty result; imported copies never override it.
 * Unlinked roster rows retain their own identity, without guessing from PII.
 */
export function buildEditionSummary(
    run: AcademyRunDTO,
    participants: AcademyRunParticipantDTO[],
    roster: WebinarRosterRow[],
    now: string = new Date().toISOString(),
): EditionSummary {
    const currentTime = Date.parse(now)
    if (!Array.isArray(participants) || !Array.isArray(roster) || !Number.isFinite(currentTime)
        || !Number.isInteger(run.confirmedCount) || run.confirmedCount < 0
        || !Number.isInteger(run.waitlistCount) || run.waitlistCount < 0) throw incompleteData()

    const confirmed = new Map<string, AcademyRunParticipantDTO>()
    const waiting = new Set<string>()
    for (const participant of participants) {
        if (participant.status === 'waitlisted') waiting.add(participant.userId)
        if (participant.status !== 'confirmed') continue
        if (!participant.userId || !participant.enrollmentId || !Array.isArray(participant.attendance)) throw incompleteData()
        const previous = confirmed.get(participant.userId)
        if (previous && (previous.registrationId !== participant.registrationId
            || previous.enrollmentId !== participant.enrollmentId)) throw incompleteData()
        confirmed.set(participant.userId, participant)
    }

    const webinarOnly = new Map<string, WebinarRosterRow>()
    for (const person of roster) {
        if (person.status !== 'confirmed' || (person.userId && confirmed.has(person.userId))) continue
        if (!person.id || !Array.isArray(person.attendance)) throw incompleteData()
        const key = person.userId ? 'user:' + person.userId : 'roster:' + person.id
        const previous = webinarOnly.get(key)
        if (previous && previous.id !== person.id) throw incompleteData()
        webinarOnly.set(key, person)
    }

    const registrations = confirmed.size + webinarOnly.size
    if (registrations !== run.confirmedCount || waiting.size !== run.waitlistCount) throw incompleteData()

    const attendance = [
        ...Array.from(confirmed.values(), person => person.attendance),
        ...Array.from(webinarOnly.values(), person => person.attendance),
    ]
    const sessions = run.sessions.filter(session => session.status === 'scheduled').map(session => {
        const start = Date.parse(session.actualStartsAt ?? '')
        const end = Date.parse(session.actualEndsAt ?? '')
        // Only a confirmed, completed real teaching window can support totals.
        const windowConfirmed = session.attendanceWindowConfirmed && Number.isFinite(start)
            && Number.isFinite(end) && start < end && end <= currentTime
        let observed = 0, meetsThreshold = 0, belowThreshold = 0, unverified = 0
        for (const rows of attendance) {
            if (!windowConfirmed) { unverified++; continue }
            const matches = rows.filter(row => row.sessionId === session.id)
            if (matches.length > 1) throw incompleteData()
            const evidence = matches[0]
            if (evidence && Number.isFinite(evidence.attendedSeconds) && evidence.attendedSeconds > 0) observed++
            if (evidence?.status === 'present') meetsThreshold++
            else if (evidence?.status === 'insufficient') belowThreshold++
            else unverified++
        }
        return {
            id: session.id, title: session.title, windowConfirmed,
            observed, meetsThreshold, belowThreshold, unverified,
            observedPercent: windowConfirmed && registrations > 0 ? Math.round(observed / registrations * 1000) / 10 : null,
        }
    })

    return {
        registrations, compassRegistrations: confirmed.size, webinarOnlyRegistrations: webinarOnly.size,
        noCompassAccount: Array.from(webinarOnly.values()).filter(person => !person.userId).length,
        waitlisted: waiting.size, sessions,
    }
}
