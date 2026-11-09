import type { WebinarRosterRow } from './webinar-import'
import type { AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'

export type RunPersonSource = 'compass' | 'teams' | 'both'

export interface RunPerson {
    key: string
    fullName: string
    email: string
    source: RunPersonSource
    status: 'confirmed' | 'waitlisted'
    hasAccount: boolean
    /** Null means the snapshot could not be read, which is not the same as "not found". */
    inNexus: boolean | null
}

function normalized(email: string): string {
    return email.trim().toLowerCase()
}

/** One line per person: a Teams roster row and a COMPASS sign-up of the same account are merged. */
export function mergeRunPeople(participants: AcademyRunParticipantDTO[], roster: WebinarRosterRow[], nexusEmails: ReadonlySet<string> | null): RunPerson[] {
    const inNexus = (...emails: Array<string | null | undefined>) => nexusEmails ? emails.some(email => email && nexusEmails.has(normalized(email))) : null
    const activeRoster = roster.filter(row => row.status === 'confirmed')
    const claimed = new Set<string>()
    const people: RunPerson[] = participants.filter(person => person.status !== 'cancelled').map(person => {
        const linked = activeRoster.find(row => row.userId === person.userId || normalized(row.email) === normalized(person.email))
        if (linked) claimed.add(linked.id)
        return {
            key: `registration:${person.registrationId}`,
            fullName: person.fullName || linked?.fullName || person.email,
            email: normalized(person.email),
            source: linked ? 'both' : 'compass',
            status: person.status === 'waitlisted' ? 'waitlisted' : 'confirmed',
            hasAccount: true,
            inNexus: inNexus(person.email, linked?.email, linked?.contractualEmail),
        }
    })
    for (const row of activeRoster) {
        if (claimed.has(row.id)) continue
        people.push({
            key: `roster:${row.id}`, fullName: row.fullName, email: normalized(row.email), source: 'teams', status: 'confirmed',
            hasAccount: row.userId !== null, inNexus: inNexus(row.email, row.contractualEmail),
        })
    }
    return people.sort((a, b) => Number(a.inNexus !== false) - Number(b.inNexus !== false) || a.fullName.localeCompare(b.fullName, 'pl'))
}

export interface RunPeopleSummary { total: number; confirmed: number; waitlisted: number; withoutAccount: number; matched: number; unmatched: number }

export function summarizeRunPeople(people: RunPerson[]): RunPeopleSummary {
    return {
        total: people.length,
        confirmed: people.filter(person => person.status === 'confirmed').length,
        waitlisted: people.filter(person => person.status === 'waitlisted').length,
        withoutAccount: people.filter(person => !person.hasAccount).length,
        matched: people.filter(person => person.inNexus === true).length,
        unmatched: people.filter(person => person.inNexus === false).length,
    }
}
