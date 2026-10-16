import { describe, expect, it } from 'vitest'

import {
    MAX_EXITS_PER_RUN,
    MAX_RETURNS_PER_RUN,
    RosterContractError,
    parseNexusRoster,
    planRosterSync,
    type CompassProfileRow,
    type NexusRosterPerson,
} from '@/lib/hr/nexus-roster'

// Fikcyjne osoby — żadnych prawdziwych adresów.
function profile(id: string, overrides: Partial<CompassProfileRow> = {}): CompassProfileRow {
    return {
        id,
        email: `${id}@example.test`,
        role: 'internal',
        employment_status: 'active',
        manager_id: null,
        work_start_date: '2026-01-05',
        termination_date: null,
        ...overrides,
    }
}

function person(id: string, overrides: Partial<NexusRosterPerson> = {}): NexusRosterPerson {
    return {
        email: `${id}@example.test`,
        employment_status: 'active',
        manager_email: null,
        work_start_date: '2026-01-05',
        last_working_day: null,
        ...overrides,
    }
}

describe('parseNexusRoster', () => {
    const body = (people: unknown[], count = people.length) => ({ count, generated_at: '2026-11-13T18:00:00+01:00', people })

    it('accepts the NEXUS contract and drops fields Compass does not need', () => {
        const parsed = parseNexusRoster(body([{ ...person('p1'), name: 'Fikcyjna Osoba', department: 'X', job_title: 'Y', account_active: true, exited_at: null }]))
        expect(parsed).toEqual([person('p1')])
        expect(parsed[0]).not.toHaveProperty('name')
    })

    it('treats an empty list as a failure, not as “everyone left”', () => {
        expect(() => parseNexusRoster(body([]))).toThrow(RosterContractError)
    })

    it('refuses a truncated list (count does not match)', () => {
        expect(() => parseNexusRoster(body([person('p1')], 2))).toThrow(/niekompletna/)
    })

    it('refuses unknown statuses and malformed dates without echoing row content', () => {
        let message = ''
        try {
            parseNexusRoster(body([{ ...person('p1'), employment_status: 'retired' }]))
        } catch (e) {
            message = (e as Error).message
        }
        expect(message).toContain('people.0.employment_status')
        expect(message).not.toContain('p1@example.test')
        expect(() => parseNexusRoster(body([{ ...person('p1'), work_start_date: '05.01.2026' }]))).toThrow(RosterContractError)
        expect(() => parseNexusRoster(null)).toThrow(RosterContractError)
    })
})

describe('planRosterSync', () => {
    it('matches by e-mail regardless of case and spacing', () => {
        const plan = planRosterSync(
            [person('p1', { email: '  P1@Example.TEST ', employment_status: 'offboarding' })],
            [profile('p1')],
        )
        expect(plan.stats.matched).toBe(1)
        expect(plan.changes).toEqual([
            expect.objectContaining({ id: 'p1', previousStatus: 'active', patch: { employment_status: 'offboarding' } }),
        ])
    })

    it('never exits someone just because they are missing from the list', () => {
        const plan = planRosterSync([person('p1')], [profile('p1'), profile('p2')])
        expect(plan.changes).toEqual([])
        expect(plan.stats).toMatchObject({ matched: 1, unchanged: 1, exits: 0 })
    })

    it('exits only on an explicit status and asks for an Auth cut-off', () => {
        const plan = planRosterSync(
            [person('p1', { employment_status: 'exited', last_working_day: '2026-10-31' })],
            [profile('p1', { employment_status: 'offboarding' })],
        )
        expect(plan.refusals).toEqual([])
        expect(plan.changes[0]).toMatchObject({
            exit: true,
            returning: false,
            patch: { employment_status: 'exited', termination_date: '2026-10-31' },
        })
    })

    it(`refuses the whole run when more than ${MAX_EXITS_PER_RUN} people would exit at once`, () => {
        const ids = Array.from({ length: MAX_EXITS_PER_RUN + 1 }, (_, i) => `p${i}`)
        const plan = planRosterSync(
            [...ids.map((id) => person(id, { employment_status: 'exited' })), person('stay', { work_start_date: '2026-02-02' })],
            [...ids.map((id) => profile(id)), profile('stay')],
        )
        expect(plan.refusals).toEqual(['mass_exit'])
        expect(plan.stats.exits).toBe(MAX_EXITS_PER_RUN + 1)
    })

    it('allows exactly the limit', () => {
        const ids = Array.from({ length: MAX_EXITS_PER_RUN }, (_, i) => `p${i}`)
        const plan = planRosterSync(ids.map((id) => person(id, { employment_status: 'exited' })), ids.map((id) => profile(id)))
        expect(plan.refusals).toEqual([])
    })

    it('handles a return from exited: lifts the ban and clears the last working day', () => {
        const plan = planRosterSync(
            [person('p1', { employment_status: 'active', last_working_day: null })],
            [profile('p1', { employment_status: 'exited', termination_date: '2026-09-30' })],
        )
        expect(plan.changes[0]).toMatchObject({
            returning: true,
            exit: false,
            patch: { employment_status: 'active', termination_date: null },
        })
        expect(plan.stats.returns).toBe(1)
    })

    it('keeps a known last working day when NEXUS simply does not send one', () => {
        const plan = planRosterSync(
            [person('p1', { employment_status: 'offboarding', last_working_day: null })],
            [profile('p1', { employment_status: 'offboarding', termination_date: '2026-12-31' })],
        )
        expect(plan.changes).toEqual([])
    })

    it('sets the manager only when NEXUS names one that exists in Compass', () => {
        const plan = planRosterSync(
            [
                person('p1', { manager_email: 'boss@example.test' }),
                person('p2', { manager_email: 'nobody@example.test' }),
                person('p3', { manager_email: null }),
            ],
            [profile('p1'), profile('p2', { manager_id: 'old-boss' }), profile('p3', { manager_id: 'old-boss' }), profile('boss')],
        )
        expect(plan.changes).toEqual([expect.objectContaining({ id: 'p1', patch: { manager_id: 'boss' } })])
        expect(plan.stats.manager_unknown).toBe(1)
    })

    it('never makes someone their own manager', () => {
        const plan = planRosterSync([person('p1', { manager_email: 'p1@example.test' })], [profile('p1')])
        expect(plan.changes).toEqual([])
        expect(plan.stats.manager_unknown).toBe(1)
    })

    it('does not guess between duplicated e-mails on either side', () => {
        const plan = planRosterSync(
            [person('dup', { employment_status: 'exited' }), person('twin', { employment_status: 'exited' }), person('twin')],
            [profile('dup'), { ...profile('dup2'), email: 'DUP@example.test' }, profile('twin')],
        )
        expect(plan.changes).toEqual([])
        expect(plan.stats).toMatchObject({ ambiguous_email: 1, duplicate_in_nexus: 2, exits: 0 })
    })

    it('updates the start date and counts people Compass does not have', () => {
        const plan = planRosterSync(
            [person('p1', { work_start_date: '2026-03-01' }), person('newcomer')],
            [profile('p1')],
        )
        expect(plan.changes).toEqual([expect.objectContaining({ patch: { work_start_date: '2026-03-01' } })])
        expect(plan.stats.not_in_compass).toBe(1)
    })

    it('never touches the role', () => {
        const plan = planRosterSync([person('p1', { employment_status: 'onboarding' })], [profile('p1', { employment_status: 'pending' })])
        expect(Object.keys(plan.changes[0].patch)).toEqual(['employment_status'])
    })

    it(`refuses a run that would bring back more than ${MAX_RETURNS_PER_RUN} exited people at once`, () => {
        const ids = Array.from({ length: MAX_RETURNS_PER_RUN + 1 }, (_, i) => `r${i}`)
        const plan = planRosterSync(
            ids.map((id) => person(id, { employment_status: 'active' })),
            ids.map((id) => profile(id, { employment_status: 'exited', termination_date: '2026-06-30' })),
        )
        expect(plan.refusals).toEqual(['mass_return'])
        expect(plan.stats.returns).toBe(MAX_RETURNS_PER_RUN + 1)
    })

    it('never exits an admin automatically, but still syncs their other fields', () => {
        const plan = planRosterSync(
            [person('boss', { employment_status: 'exited', work_start_date: '2026-04-01' })],
            [profile('boss', { role: 'admin' })],
        )
        expect(plan.stats.skipped_admin).toBe(1)
        expect(plan.stats.exits).toBe(0)
        expect(plan.changes).toEqual([
            expect.objectContaining({ id: 'boss', exit: false, patch: { work_start_date: '2026-04-01' } }),
        ])
    })

    it('honours a custom protection rule (e.g. SUPER_ADMIN_EMAILS)', () => {
        const plan = planRosterSync(
            [person('owner', { employment_status: 'exited' })],
            [profile('owner')],
            { isProtected: (row) => row.email === 'owner@example.test' },
        )
        expect(plan.changes).toEqual([])
        expect(plan.stats.skipped_admin).toBe(1)
    })
})
