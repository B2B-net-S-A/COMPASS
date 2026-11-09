import { describe, expect, it, vi } from 'vitest'
import { audienceClients, invitationExpiry, runInvitationMail, selectAudience, type AudienceCandidate } from '../run-audience'

vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))

const nexus = (email: string, clientName: string | null = 'Bank'): AudienceCandidate => ({ email, fullName: email, source: 'nexus', clientName })
const office = (email: string): AudienceCandidate => ({ email, fullName: `Biuro ${email}`, source: 'office', clientName: null })
const all = { includeNexus: true, includeOffice: true, clients: [] }

describe('selectAudience', () => {
    it('sends one invitation to a person on both lists', () => {
        const { recipients } = selectAudience([nexus('A@example.test'), office('a@example.test')], all, [])
        expect(recipients).toHaveLength(1)
        expect(recipients[0]).toMatchObject({ email: 'a@example.test', source: 'office' })
    })
    it('honours each source switch', () => {
        const people = [nexus('a@example.test'), office('b@example.test')]
        expect(selectAudience(people, { ...all, includeOffice: false }, []).recipients.map(p => p.email)).toEqual(['a@example.test'])
        expect(selectAudience(people, { ...all, includeNexus: false }, []).recipients.map(p => p.email)).toEqual(['b@example.test'])
        expect(selectAudience(people, { ...all, includeNexus: false, includeOffice: false }, []).recipients).toEqual([])
    })
    it('filters consultants by client and leaves the office outside that filter', () => {
        const people = [nexus('a@example.test', 'Bank'), nexus('b@example.test', 'Ubezpieczenia'), nexus('c@example.test', null), office('d@example.test')]
        expect(selectAudience(people, { ...all, clients: ['Bank'] }, []).recipients.map(p => p.email)).toEqual(['a@example.test', 'd@example.test'].sort((x, y) => x.localeCompare(y)).sort(() => 0))
    })
    it('counts an excluded address once and removes it from every list', () => {
        const result = selectAudience([nexus('x@example.test'), office('x@example.test'), nexus('y@example.test')], all, [' X@example.test '])
        expect(result.recipients.map(p => p.email)).toEqual(['y@example.test'])
        expect(result.excludedCount).toBe(1)
    })
    it('does not count an exclusion that matches nobody', () => {
        expect(selectAudience([nexus('y@example.test')], all, ['ghost@example.test']).excludedCount).toBe(0)
    })
    it('skips a candidate without an address', () => {
        expect(selectAudience([nexus(' ')], all, []).recipients).toEqual([])
    })
    it('lists each client once in Polish order and ignores the office', () => {
        expect(audienceClients([nexus('a', 'Żabka'), nexus('b', 'Agora'), nexus('c', 'Agora'), office('d')])).toEqual(['Agora', 'Żabka'])
    })
})

describe('invitation message', () => {
    it('carries the personal link placeholder and never a token', () => {
        const { html, subject } = runInvitationMail({ courseTitle: 'PEGA', runTitle: 'Grupa', startsLabel: '16 lutego' })
        expect(html).toContain('{{academy_personal_link}}')
        expect(`${subject} ${html}`).not.toMatch(/[?&](token|otp)=/)
    })
    it('escapes titles written by organizers', () => {
        expect(runInvitationMail({ courseTitle: '<b>x</b>', runTitle: 'a&b', startsLabel: 't' }).html).toContain('&lt;b&gt;x&lt;/b&gt;')
    })
})

describe('invitationExpiry', () => {
    const now = new Date('2027-01-01T00:00:00Z')
    it('expires on the first session', () => {
        expect(invitationExpiry('2027-01-20T09:00:00Z', now)).toBe('2027-01-20T09:00:00.000Z')
    })
    it('refuses a past or malformed session', () => {
        expect(invitationExpiry('2026-12-31T09:00:00Z', now)).toBeNull()
        expect(invitationExpiry('nie-data', now)).toBeNull()
    })
    it('stays within the 90-day limit of the outbox', () => {
        expect(invitationExpiry('2027-09-01T09:00:00Z', now)).toBe(new Date(now.getTime() + 89 * 86_400_000).toISOString())
    })
})
