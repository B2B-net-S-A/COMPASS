import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { editionCockpitIssues, editionCockpitSteps, INVITATION_KIND, REMINDER_KIND, type CockpitInput } from '../edition-cockpit'

const start = Date.parse('2027-04-27T08:00:00Z')
const day = 86_400_000
const input = (overrides: Partial<CockpitInput> = {}): CockpitInput => ({
    runId: 'r', sessionStart: new Date(start).toISOString(), sessionEnd: new Date(start + 2 * 3_600_000).toISOString(),
    capacity: 80, confirmed: 64, waitlisted: 0, outbox: [], questions: { approved: 12, draft: 0 }, closing: [], now: start - 13 * day, ...overrides,
})
const closing = (key: 'attendance' | 'materials', state: 'done' | 'todo') => ({ key, title: key, state, stateLabel: state === 'done' ? 'Gotowe' : 'Do zrobienia', detail: `${key} opis` })
const step = (result: ReturnType<typeof editionCockpitSteps>, key: string) => result.find(item => item.key === key)!

describe('editionCockpitSteps', () => {
    it('lays out all eight steps from T-21 to T+30 with their dates', () => {
        const steps = editionCockpitSteps(input())
        expect(steps.map(s => s.label)).toEqual(['T-21', 'T-7', 'T-1', 'T0', 'T+1', 'T+2', 'T+7', 'T+30'])
        expect(step(steps, 't21').dateIso).toBe('2027-04-06T08:00:00.000Z')
        expect(step(steps, 't30p').dateIso.startsWith('2027-05-27')).toBe(true)
    })

    it('returns nothing for an edition without a date', () => {
        expect(editionCockpitSteps(input({ sessionStart: null }))).toEqual([])
    })

    it('counts invitations and T-21 reminders together and separates the later stages', () => {
        const outbox = [
            { kind: 'academy.run_invitation', status: 'held', dedupe_key: 'x' },
            { kind: 'academy.run_reminder', status: 'held', dedupe_key: 'run_reminder:s:t21:a@x' },
            { kind: 'academy.run_reminder', status: 'held', dedupe_key: 'run_reminder:s:t7:a@x' },
            { kind: 'academy.run_reminder', status: 'sent', dedupe_key: 'run_reminder:s:t1:a@x' },
            { kind: 'academy.run_reminder', status: 'held', dedupe_key: 'run_reminder:s:t1h:a@x' },
        ]
        const steps = editionCockpitSteps(input({ outbox }))
        expect(step(steps, 't21')).toMatchObject({ status: 'Wstrzymane: 2', state: 'current' })
        expect(step(steps, 't7')).toMatchObject({ status: 'Wstrzymane: 1' })
        expect(step(steps, 't1')).toMatchObject({ status: 'Wstrzymane: 1', state: 'done' })
    })

    it('says the queue is unavailable instead of pretending it is empty', () => {
        expect(step(editionCockpitSteps(input({ outbox: null })), 't7').status).toBe('Kolejka niedostępna')
    })

    it('flags attendance only after its date has passed', () => {
        const before = editionCockpitSteps(input({ closing: [closing('attendance', 'todo')] }))
        expect(step(before, 't1p').state).toBe('upcoming')
        const after = editionCockpitSteps(input({ closing: [closing('attendance', 'todo')], now: start + 3 * day }))
        expect(step(after, 't1p')).toMatchObject({ state: 'attention', status: 'Do zrobienia' })
        const done = editionCockpitSteps(input({ closing: [closing('attendance', 'done')], now: start + 3 * day }))
        expect(step(done, 't1p').state).toBe('done')
    })

    it('marks the live step by the real clock', () => {
        expect(step(editionCockpitSteps(input()), 't0').state).toBe('upcoming')
        expect(step(editionCockpitSteps(input({ now: start + 3_600_000 })), 't0').state).toBe('current')
        expect(step(editionCockpitSteps(input({ now: start + 3 * 3_600_000 })), 't0').state).toBe('done')
    })
})

describe('editionCockpitIssues', () => {
    const issuesOf = (over: Partial<CockpitInput>) => { const data = input(over); return editionCockpitIssues(data, editionCockpitSteps(data)).map(issue => issue.key) }

    it('stays quiet before anything is due', () => {
        expect(issuesOf({})).toEqual([])
    })

    it('raises overdue attendance and materials with a way to act', () => {
        const data = input({ now: start + 3 * day, closing: [closing('attendance', 'todo'), closing('materials', 'todo')] })
        const issues = editionCockpitIssues(data, editionCockpitSteps(data))
        expect(issues.map(issue => issue.key)).toEqual(['attendance', 'materials'])
        expect(issues[0].href).toBe('/learning/edycje/r/zamkniecie')
    })

    it('raises draft questions, expired messages and an unreadable queue', () => {
        expect(issuesOf({ questions: { approved: 12, draft: 6 } })).toEqual(['questions'])
        expect(issuesOf({ outbox: [{ kind: 'academy.run_reminder', status: 'expired', dedupe_key: null }] })).toEqual(['expired'])
        expect(issuesOf({ outbox: null })).toEqual(['outbox'])
    })

    it('warns about a full edition only before it starts', () => {
        expect(issuesOf({ confirmed: 80 })).toEqual(['full'])
        expect(issuesOf({ confirmed: 80, now: start + day })).not.toContain('full')
    })
})

describe('zgodność z nadawcami wiadomości', () => {
    const read = (file: string) => readFileSync(path.resolve(__dirname, '../..', file), 'utf8')

    it('rozpoznaje rodzaje i klucze, które zapisują zaproszenia i przypomnienia', () => {
        expect(read('actions/academy-run-audience.ts')).toContain(`INVITATION_KIND = '${INVITATION_KIND}'`)
        const reminders = read('academy/run-reminders.ts')
        expect(reminders).toContain(`REMINDER_KIND = '${REMINDER_KIND}'`)
        expect(reminders).toContain('`run_reminder:${sessionId}:${stage}:${email}`')
    })
})
