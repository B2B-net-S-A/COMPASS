import { describe, expect, it } from 'vitest'
import { closingAttendanceCounts, completedSteps, editionClosingSteps, type ClosingInput } from '../edition-closing'
import type { AcademyRunParticipantDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'
import type { AcademyRunMaterial } from '@/lib/types/academy-materials'
import type { WebinarRosterRow } from '../webinar-import'

const session = (patch: Partial<AcademySessionDTO> = {}) => ({ id: 's', status: 'scheduled', startsAt: '2026-11-25T09:00:00Z', endsAt: '2026-11-25T12:00:00Z', timeZone: 'Europe/Warsaw', attendanceWindowConfirmed: true, actualStartsAt: '2026-11-25T09:04:00Z', actualEndsAt: '2026-11-25T11:52:00Z', ...patch }) as AcademySessionDTO
const participant = (id: string, statuses: string[], status = 'confirmed') => ({ userId: id, status, attendance: statuses.map(item => ({ status: item })) }) as unknown as AcademyRunParticipantDTO
const roster = (id: string, statuses: string[], patch: Partial<WebinarRosterRow> = {}) => ({ id, status: 'confirmed', userId: null, attendance: statuses.map(item => ({ sessionId: 's', attendedSeconds: 1, status: item })), ...patch }) as WebinarRosterRow
const material = (patch: Partial<AcademyRunMaterial>) => ({ status: 'ready', review_status: 'published', ...patch }) as AcademyRunMaterial
const input = (patch: Partial<ClosingInput> = {}): ClosingInput => ({ run: { id: 'r', sessions: [session()] }, summary: { total: 3, confirmed: 3, waitlisted: 0, withoutAccount: 1, matched: 2, unmatched: 1 }, participants: [participant('a', ['present'])], roster: [], exceptions: { available: true, open: 0 }, materials: [material({})], attendancePercent: 80, ...patch })
const step = (key: string, value: ClosingInput) => editionClosingSteps(value).find(item => item.key === key)!

describe('edition closing steps', () => {
    it('counts a Compass registration and its roster row as one person', () => {
        expect(closingAttendanceCounts([participant('a', ['present'])], [roster('r', ['present'], { userId: 'a' })])).toEqual({ present: 1, insufficient: 0, noReport: 0, total: 1 })
    })
    it('never turns a missing report into absence', () => {
        expect(closingAttendanceCounts([participant('a', [])], [roster('r', [])])).toEqual({ present: 0, insufficient: 0, noReport: 2, total: 2 })
    })
    it('needs every result positive to count as present and skips the waitlist', () => {
        expect(closingAttendanceCounts([participant('a', ['present', 'insufficient']), participant('b', ['present'], 'waitlisted')], [])).toEqual({ present: 0, insufficient: 1, noReport: 0, total: 1 })
    })
    it('treats a pending review as not yet present', () => {
        expect(closingAttendanceCounts([participant('a', ['needs_review'])], []).insufficient).toBe(1)
    })
    it('gives the actual time and the threshold in minutes', () => {
        const time = step('time', input())
        expect(time.state).toBe('done')
        expect(time.detail).toBe('Plan 10:00–13:00, rzeczywiście 10:04–12:52, czyli 168 min.')
        expect(time.note).toBe('Próg obecności 80%: co najmniej 135 min.')
    })
    it('waits for every session window and ignores cancelled sessions', () => {
        expect(step('time', input({ run: { id: 'r', sessions: [session(), session({ attendanceWindowConfirmed: false })] } })).state).toBe('todo')
        expect(step('time', input({ run: { id: 'r', sessions: [session(), session({ status: 'cancelled', attendanceWindowConfirmed: false })] } })).state).toBe('done')
        expect(step('time', input({ run: { id: 'r', sessions: [] } })).state).toBe('todo')
    })
    it('holds attendance open until exceptions are decided', () => {
        expect(step('attendance', input({ exceptions: { available: true, open: 2 } }))).toMatchObject({ state: 'todo', stateLabel: 'Wyjątki: 2' })
        expect(step('attendance', input({ participants: [participant('a', [])] }))).toMatchObject({ state: 'todo', detail: 'Raport frekwencji nie został jeszcze wczytany.' })
        expect(step('attendance', input()).state).toBe('done')
    })
    it('does not claim exceptions work before their migration', () => {
        expect(step('attendance', input({ exceptions: { available: false, open: 0 } })).note).toContain('po zastosowaniu migracji')
    })
    it('separates missing, waiting, failed and published materials', () => {
        expect(step('materials', input({ materials: [] })).state).toBe('todo')
        expect(step('materials', input({ materials: [material({ review_status: 'pending_review' }), material({})] }))).toMatchObject({ state: 'waiting', detail: 'Czeka na akceptację: 1 z 2.' })
        expect(step('materials', input({ materials: [material({ review_status: 'rejected' })] })).state).toBe('todo')
        expect(step('materials', input({ materials: null })).detail).toContain('Nie udało się')
        expect(step('materials', input()).state).toBe('done')
    })
    it('keeps sending off and never counts it as finished', () => {
        const steps = editionClosingSteps(input())
        expect(steps.find(item => item.key === 'messages')).toMatchObject({ state: 'off', stateLabel: 'Wysyłka wyłączona' })
        expect(completedSteps(steps)).toBe(4)
    })
    it('asks for a list on an empty edition', () => {
        expect(step('list', input({ summary: { total: 0, confirmed: 0, waitlisted: 0, withoutAccount: 0, matched: 0, unmatched: 0 } }))).toMatchObject({ state: 'todo', actionHref: '/learning/edycje/r#import-webinaru' })
    })
})
