import { describe, expect, it } from 'vitest'
import { mergeRunPeople, summarizeRunPeople } from '../run-people'
import type { AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import type { WebinarRosterRow } from '../webinar-import'

const participant = (id: string, email: string, status: AcademyRunParticipantDTO['status'] = 'confirmed', fullName: string | null = id) => ({ registrationId: id, userId: `user-${id}`, email, fullName, status }) as AcademyRunParticipantDTO
const roster = (id: string, email: string, patch: Partial<WebinarRosterRow> = {}) => ({ id, email, fullName: id, userId: null, contractualEmail: null, status: 'confirmed', match: 'x', registrationStatus: null, attendance: [], ...patch }) as WebinarRosterRow

describe('mergeRunPeople', () => {
    it('counts a person registered in COMPASS and in the Teams report once', () => {
        const people = mergeRunPeople([participant('a', 'A@Example.test')], [roster('r', 'a@example.test', { userId: 'user-a' })], new Set())
        expect(people).toHaveLength(1)
        expect(people[0]).toMatchObject({ source: 'both', hasAccount: true, email: 'a@example.test' })
    })
    it('merges by address when the roster row has no account link', () => {
        expect(mergeRunPeople([participant('a', 'a@example.test')], [roster('r', 'A@EXAMPLE.TEST')], null)).toHaveLength(1)
    })
    it('keeps a Teams-only person without an account', () => {
        expect(mergeRunPeople([], [roster('r', 'guest@example.test')], new Set())[0]).toMatchObject({ source: 'teams', hasAccount: false, inNexus: false })
    })
    it('leaves out cancelled people from both sources', () => {
        expect(mergeRunPeople([participant('a', 'a@example.test', 'cancelled')], [roster('r', 'r@example.test', { status: 'cancelled' })], new Set())).toEqual([])
    })
    it('keeps the waitlist separate from confirmed seats', () => {
        const people = mergeRunPeople([participant('a', 'a@example.test'), participant('b', 'b@example.test', 'waitlisted')], [], new Set())
        expect(summarizeRunPeople(people)).toMatchObject({ total: 2, confirmed: 1, waitlisted: 1 })
    })
    it('matches the snapshot on any known address of the person', () => {
        const nexus = new Set(['contract@example.test'])
        expect(mergeRunPeople([participant('a', 'priv@example.test')], [roster('r', 'priv@example.test', { contractualEmail: 'contract@example.test' })], nexus)[0].inNexus).toBe(true)
    })
    it('reports an unreadable snapshot as unknown, never as missing', () => {
        const people = mergeRunPeople([participant('a', 'a@example.test')], [], null)
        expect(people[0].inNexus).toBeNull()
        expect(summarizeRunPeople(people)).toMatchObject({ matched: 0, unmatched: 0 })
    })
    it('puts people missing from the snapshot first, then sorts by Polish name', () => {
        const nexus = new Set(['z@example.test', 'a@example.test'])
        const order = mergeRunPeople([participant('a', 'a@example.test', 'confirmed', 'Żaneta'), participant('z', 'z@example.test', 'confirmed', 'Adam'), participant('m', 'm@example.test', 'confirmed', 'Marek')], [], nexus)
        expect(order.map(person => person.fullName)).toEqual(['Marek', 'Adam', 'Żaneta'])
    })
    it('falls back to the address when a person has no name', () => {
        expect(mergeRunPeople([participant('a', 'a@example.test', 'confirmed', null)], [], null)[0].fullName).toBe('a@example.test')
    })
})
