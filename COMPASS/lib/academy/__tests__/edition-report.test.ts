import { describe, expect, it } from 'vitest'
import { buildEditionReport, editionReportCsv, type EditionReportEvidence } from '../edition-report'
import type { EditionSummary } from '../edition-summary'
import type { AcademyRunDTO, AcademyRunParticipantDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'
import type { EditionSurveyReport } from '@/lib/types/academy-surveys'
import type { WebinarRosterRow } from '../webinar-import'

const session = (id: string, extra: Partial<AcademySessionDTO> = {}) => ({
    id, title: id, startsAt: '2026-11-25T09:00:00Z', endsAt: '2026-11-25T11:00:00Z', required: true, status: 'scheduled',
    actualStartsAt: '2026-11-25T09:00:00Z', actualEndsAt: '2026-11-25T11:00:00Z', attendanceWindowConfirmed: true, ...extra,
}) as AcademySessionDTO
const run = { id: 'run', courseId: 'c', versionId: 'v', courseTitle: 'PEGA', title: 'Edycja 25.11', confirmedCount: 0, waitlistCount: 0, sessions: [session('s1')] } as unknown as AcademyRunDTO
const person = (n: number, attendance = 'present', completion: AcademyRunParticipantDTO['completionState'] = 'pending') => ({
    registrationId: `r${n}`, userId: `u${n}`, enrollmentId: `e${n}`, fullName: `Osoba Prywatna ${n}`, email: `osoba${n}@example.test`, status: 'confirmed',
    completedAt: null, completionState: completion, completionRevokedAt: null, progress: null,
    attendance: attendance === 'none' ? [] : [{ sessionId: 's1', status: attendance, attendedSeconds: 3600, source: 'teams', note: null }],
}) as AcademyRunParticipantDTO
const summary = (registrations: number): EditionSummary => ({
    registrations, compassRegistrations: registrations, webinarOnlyRegistrations: 0, noCompassAccount: 0, waitlisted: 0,
    sessions: [{ id: 's1', title: 's1', windowConfirmed: true, observed: registrations, meetsThreshold: registrations, belowThreshold: 0, unverified: 0, observedPercent: 100 }],
})
const survey: EditionSurveyReport = { responseCount: 1, overall: 4.3, trainer: 4.6, materials: 4.1, materialsResponseCount: 1, nps: null, difficulty: { too_easy: 0, appropriate: 1, too_hard: 0 }, futureTopics: ['=SUM(A1)'], teachingInterests: [{ userId: 'u1', fullName: 'Osoba Prywatna 1', proposedTopic: 'x', contactPreference: 'compass' }] }
const roster: WebinarRosterRow[] = []
const attempt = (n: number, at: string, score: number | null, passed: boolean, answers: unknown = [], kind?: string, status?: string) => ({ enrollment_id: `e${n}`, answers, score_percent: score, passed, attempted_at: at, kind, status })
const evidence = (overrides: Partial<EditionReportEvidence> = {}): EditionReportEvidence => ({
    quizRequired: true, passPercent: 70, attempts: [], questions: [], options: [], gain: { participants: 0, average_pre: null, average_final: null, average_gain: null }, voidingTracked: true, keyHolderEnrollments: [],
    participationDocuments: 0, reportsStartAt: '2026-01-01T00:00:00Z', rehearsalCourse: false, ...overrides,
})
const report = (people: AcademyRunParticipantDTO[], e: EditionReportEvidence, s = summary(people.length), r = run) => buildEditionReport(r, people, roster, s, survey, e)

describe('buildEditionReport', () => {
    it('classifies by the first scored attempt, regardless of row order and later retakes', () => {
        const r = report([person(1), person(2), person(3)], evidence({ attempts: [
            attempt(1, '2026-11-26T12:00:00Z', 90, true), attempt(1, '2026-11-26T10:00:00Z', 50, false),
            attempt(2, '2026-11-26T10:00:00Z', 80, true),
            attempt(3, '2026-11-26T10:00:00Z', 40, false),
        ] }))
        expect(r.quiz).toEqual({ passPercent: 70, attempted: 3, averageFirstScore: 57, passedFirst: 1, passedLater: 1, notPassed: 1, passedTotal: 2 })
        expect(r.passedOfPresentPercent).toBe(67)
    })

    it('ignores attempts of cancelled or waitlisted people', () => {
        const cancelled = { ...person(2), status: 'cancelled' } as AcademyRunParticipantDTO
        const r = report([person(1), cancelled], evidence({ attempts: [attempt(1, '2026-11-26T10:00:00Z', 80, true), attempt(2, '2026-11-26T10:00:00Z', 10, false)] }), summary(1))
        expect(r.quiz?.attempted).toBe(1)
        expect(r.quiz?.notPassed).toBe(0)
    })

    it('reports no quiz block when the edition has no test, instead of zeros', () => {
        expect(report([person(1)], evidence({ quizRequired: false })).quiz).toBeNull()
    })

    it('keeps an existing but unattempted quiz visible with empty first-attempt results', () => {
        const r = report([person(1)], evidence())
        expect(r.quiz).toEqual({ passPercent: 70, attempted: 0, averageFirstScore: null, passedFirst: 0, passedLater: 0, notPassed: 0, passedTotal: 0 })
    })

    it('does not count pre-test attempts as the first scored attempt and takes the gain from the database', () => {
        const r = report([person(1), person(2)], evidence({
            gain: { participants: 2, average_pre: 50, average_final: 85, average_gain: 35 },
            attempts: [
                attempt(1, '2026-11-20T10:00:00Z', 40, false, [], 'pre'), attempt(1, '2026-11-26T10:00:00Z', 80, true, [], 'final'),
                attempt(2, '2026-11-20T10:00:00Z', 60, false, [], 'pre'),
            ],
        }))
        expect(r.quiz?.attempted).toBe(1)
        expect(r.preTest).toEqual({ tracked: true, solved: 2, both: 2, before: 50, after: 85, gain: 35 })
    })

    it('says the pre-test waits for its migration rather than showing zero', () => {
        expect(report([person(1)], evidence({ gain: null })).preTest).toEqual({ tracked: false })
    })

    it('leaves out an attempt still in progress, which has no score yet', () => {
        const r = report([person(1)], evidence({ attempts: [
            attempt(1, '2026-11-26T09:00:00Z', null, false, [], 'final', 'in_progress'),
            attempt(1, '2026-11-26T10:00:00Z', 90, true, [], 'final', 'submitted'),
        ] }))
        expect(r.quiz).toMatchObject({ attempted: 1, averageFirstScore: 90, passedFirst: 1 })
    })

    it('keeps people with access to the answer key out of the results, but not out of attendance or documents', () => {
        const r = report([person(1, 'present', 'completed'), person(2)], evidence({
            keyHolderEnrollments: ['e1'],
            questions: [{ id: 'q', order_index: 0, question_text: 'P', voided_at: null }],
            options: [{ id: 'a', question_id: 'q', option_text: 'Dobra', is_correct: true }, { id: 'b', question_id: 'q', option_text: 'Zła', is_correct: false }],
            attempts: [
                attempt(1, '2026-11-26T10:00:00Z', 100, true, [{ question_id: 'q', selected_option_id: 'a' }]),
                attempt(2, '2026-11-26T10:00:00Z', 0, false, [{ question_id: 'q', selected_option_id: 'b' }]),
            ],
        }))
        expect(r.excludedKeyHolders).toBe(1)
        expect(r.quiz).toMatchObject({ attempted: 1, passedTotal: 0, notPassed: 1 })
        expect(r.questions?.rows[0]).toMatchObject({ correct: 0, answered: 1 })
        expect(r.present).toBe(2)
        expect(r.documents.certificates).toBe(1)
    })

    it('counts certificates only for unrevoked completions of confirmed people and keeps attestations separate', () => {
        const r = report([person(1, 'present', 'completed'), person(2, 'present', 'revoked'), person(3)], evidence({ participationDocuments: 4 }))
        expect(r.documents).toEqual({ certificates: 1, participationDocuments: 4 })
    })

    it('marks participation documents as unavailable before their migration', () => {
        expect(report([person(1)], evidence({ participationDocuments: null })).documents.participationDocuments).toBeNull()
    })

    it('requires every active required session to be confirmed before counting anyone present', () => {
        const two = { ...run, sessions: [session('s1'), session('s2', { attendanceWindowConfirmed: false })] } as AcademyRunDTO
        const s = { ...summary(1), sessions: [...summary(1).sessions, { ...summary(1).sessions[0], id: 's2', windowConfirmed: false }] }
        expect(report([person(1)], evidence(), s, two).present).toBeNull()
    })

    it('does not count a person who met the threshold in only one of two required sessions', () => {
        const two = { ...run, sessions: [session('s1'), session('s2')] } as AcademyRunDTO
        const s = { ...summary(2), sessions: [...summary(2).sessions, { ...summary(2).sessions[0], id: 's2' }] }
        const both = { ...person(1), attendance: [...person(1).attendance, { ...person(1).attendance[0], sessionId: 's2' }] } as AcademyRunParticipantDTO
        expect(report([both, person(2)], evidence(), s, two).present).toBe(1)
    })

    it('counts webinar-only roster rows toward attendance once', () => {
        const webinar: WebinarRosterRow = { id: 'w1', email: 'x@example.test', fullName: 'X', userId: null, contractualEmail: null, status: 'confirmed', match: 'none', registrationStatus: null, attendance: [{ sessionId: 's1', attendedSeconds: 60, status: 'present' }] }
        const r = buildEditionReport(run, [person(1)], [webinar], summary(2), survey, evidence())
        expect(r.present).toBe(2)
        expect(r.registered).toBe(2)
    })

    it('ignores cancelled sessions when deciding attendance', () => {
        const withCancelled = { ...run, sessions: [session('s1'), session('s2', { status: 'cancelled' })] } as AcademyRunDTO
        expect(report([person(1)], evidence(), summary(1), withCancelled).present).toBe(1)
    })

    it('labels data as rehearsal without a report start date, before it, and for a rehearsal course', () => {
        expect(report([person(1)], evidence({ reportsStartAt: null })).rehearsal).toBe(true)
        expect(report([person(1)], evidence({ reportsStartAt: '2027-03-16T00:00:00Z' })).rehearsal).toBe(true)
        expect(report([person(1)], evidence({ rehearsalCourse: true })).rehearsal).toBe(true)
        expect(report([person(1)], evidence()).rehearsal).toBe(false)
    })

    describe('question analysis', () => {
        const questions = [
            { id: 'q1', order_index: 0, question_text: 'Pierwsze', voided_at: null },
            { id: 'q2', order_index: 1, question_text: 'Drugie', voided_at: '2026-11-28T10:00:00Z' },
            { id: 'q3', order_index: 2, question_text: 'Bez odpowiedzi', voided_at: null },
        ]
        const options = [
            { id: 'a1', question_id: 'q1', option_text: 'Dobra', is_correct: true }, { id: 'a2', question_id: 'q1', option_text: 'Zła A', is_correct: false }, { id: 'a3', question_id: 'q1', option_text: 'Zła B', is_correct: false },
            { id: 'b1', question_id: 'q2', option_text: 'Dobra', is_correct: true }, { id: 'b2', question_id: 'q2', option_text: 'Zła', is_correct: false },
        ]
        const answers = (q1: string, q2: string) => [{ question_id: 'q1', selected_option_id: q1 }, { question_id: 'q2', selected_option_id: q2 }]

        it('uses only first attempts, sorts weakest first and names the most common wrong answer', () => {
            const r = report([person(1), person(2), person(3)], evidence({ questions, options, attempts: [
                attempt(1, '2026-11-26T10:00:00Z', 0, false, answers('a2', 'b1')),
                attempt(1, '2026-11-26T11:00:00Z', 100, true, answers('a1', 'b1')),
                attempt(2, '2026-11-26T10:00:00Z', 0, false, answers('a2', 'b1')),
                attempt(3, '2026-11-26T10:00:00Z', 100, true, answers('a3', 'b1')),
            ] }))
            expect(r.questions?.firstAttempts).toBe(3)
            expect(r.questions?.total).toBe(3)
            expect(r.questions?.voided).toBe(1)
            const [first, second, third] = r.questions!.rows
            expect(first).toMatchObject({ id: 'q1', number: 1, correct: 0, answered: 3, correctPercent: 0, topWrongAnswer: 'Zła A', topWrongCount: 2, voided: false })
            expect(second).toMatchObject({ id: 'q2', number: 2, correct: 3, answered: 3, correctPercent: 100, topWrongAnswer: null, voided: true })
            expect(third).toMatchObject({ id: 'q3', answered: 0, correctPercent: null })
        })

        it('skips malformed legacy answers without inventing data or crashing', () => {
            const r = report([person(1)], evidence({ questions, options, attempts: [attempt(1, '2026-11-26T10:00:00Z', 0, false, 'zepsute'), ] }))
            expect(r.questions?.rows.every(row => row.answered === 0)).toBe(true)
        })

        it('flags the analysis as unavailable when options are hidden from this account', () => {
            const r = report([person(1)], evidence({ questions, options: [], attempts: [attempt(1, '2026-11-26T10:00:00Z', 0, false, answers('a1', 'b1'))] }))
            expect(r.questions).toMatchObject({ analyzable: false, rows: [] })
        })

        it('returns no question table for an edition without questions', () => {
            expect(report([person(1)], evidence()).questions).toBeNull()
        })
    })
})

describe('editionReportCsv', () => {
    const csvOf = (r: ReturnType<typeof report>) => editionReportCsv({ courseTitle: 'PEGA', runTitle: 'Edycja 25.11', generatedAt: '2026-12-11T08:00:00Z', report: r, survey })

    it('opens with a BOM and uses a semicolon-separated, CRLF layout', () => {
        const csv = csvOf(report([person(1)], evidence()))
        expect(csv.startsWith('﻿"Sekcja";"Miara";"Wartość"\r\n')).toBe(true)
        expect(csv.endsWith('\r\n')).toBe(true)
    })

    it('contains aggregates only, never a name, address or user identifier', () => {
        const csv = csvOf(report([person(1, 'present', 'completed')], evidence({ attempts: [attempt(1, '2026-11-26T10:00:00Z', 80, true)] })))
        expect(csv).not.toContain('Osoba Prywatna')
        expect(csv).not.toContain('example.test')
        expect(csv).not.toContain('u1')
        expect(csv).not.toContain('e1"')
    })

    it('neutralizes spreadsheet formulas in free text', () => {
        const r = report([person(1)], evidence({
            questions: [{ id: 'q', order_index: 0, question_text: '=HYPERLINK("http://zly")', voided_at: null }],
            options: [{ id: 'o1', question_id: 'q', option_text: '+1', is_correct: false }, { id: 'o2', question_id: 'q', option_text: 'Dobra', is_correct: true }],
            attempts: [attempt(1, '2026-11-26T10:00:00Z', 0, false, [{ question_id: 'q', selected_option_id: 'o1' }])],
        }))
        const csv = csvOf(r)
        expect(csv).toContain(`"'=HYPERLINK(""http://zly"")"`)
        expect(csv).toContain(`"'+1"`)
        expect(csv).toContain(`"'=SUM(A1)"`)
        expect(csv).not.toContain(';"=')
    })

    it('marks rehearsal data and absent migrations in words, not as zero', () => {
        const csv = csvOf(report([person(1)], evidence({ reportsStartAt: null, gain: null, participationDocuments: null })))
        expect(csv).toContain('"Status danych";"próba (dane sprzed daty startu raportów)"')
        expect(csv).toContain('"Pre-test";"Stan";"czeka na migrację"')
        expect(csv).toContain('"Zaświadczenia udziału";"czeka na migrację"')
    })
})
