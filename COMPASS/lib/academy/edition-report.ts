import type { AcademyRunDTO, AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import type { EditionSurveyReport } from '@/lib/types/academy-surveys'
import type { EditionSummary } from './edition-summary'
import type { WebinarRosterRow } from './webinar-import'

export interface EditionAttemptEvidence {
    enrollment_id: string
    answers: unknown
    score_percent: number
    passed: boolean
    attempted_at: string
    kind?: string | null
}
export interface EditionQuestionEvidence { id: string; order_index: number; question_text: string; voided_at?: string | null }
export interface EditionOptionEvidence { id: string; question_id: string; option_text: string; is_correct: boolean }

/** Everything the report reads beyond the edition summary. The tracked flags and
 * null documents distinguish "not migrated yet" from a genuine zero. */
export interface EditionReportEvidence {
    quizRequired: boolean
    passPercent: number | null
    attempts: EditionAttemptEvidence[]
    questions: EditionQuestionEvidence[]
    options: EditionOptionEvidence[]
    preTestTracked: boolean
    voidingTracked: boolean
    participationDocuments: number | null
    reportsStartAt: string | null
    rehearsalCourse: boolean
}

export interface EditionQuestionRow {
    id: string
    number: number
    text: string
    voided: boolean
    correct: number
    answered: number
    correctPercent: number | null
    topWrongAnswer: string | null
    topWrongCount: number
}
export interface EditionReport {
    rehearsal: boolean
    registered: number
    present: number | null
    presentPercent: number | null
    passedTotal: number | null
    passedOfPresentPercent: number | null
    surveyResponses: number
    surveyOfPresentPercent: number | null
    surveyOverall: number | null
    quiz: {
        passPercent: number | null; attempted: number; averageFirstScore: number | null
        passedFirst: number; passedLater: number; notPassed: number; passedTotal: number
    } | null
    preTest: { tracked: false } | { tracked: true; solved: number; both: number; before: number | null; after: number | null; gain: number | null }
    documents: { certificates: number; participationDocuments: number | null }
    questions: { total: number; voided: number; firstAttempts: number; analyzable: boolean; voidingTracked: boolean; rows: EditionQuestionRow[] } | null
}

const percent = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 100) : null
const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
const byTime = (a: EditionAttemptEvidence, b: EditionAttemptEvidence) => Date.parse(a.attempted_at) - Date.parse(b.attempted_at)
const isPreTest = (attempt: EditionAttemptEvidence) => attempt.kind === 'pre'

function presentCount(run: AcademyRunDTO, participants: AcademyRunParticipantDTO[], roster: WebinarRosterRow[], summary: EditionSummary) {
    const windows = new Map(summary.sessions.map(session => [session.id, session.windowConfirmed]))
    const required = run.sessions.filter(session => session.status === 'scheduled' && session.required)
    if (required.length === 0 || required.some(session => !windows.get(session.id))) return null
    const met = (rows: Array<{ sessionId: string; status: string }>) =>
        required.every(session => rows.some(row => row.sessionId === session.id && row.status === 'present'))
    const confirmed = participants.filter(person => person.status === 'confirmed')
    const confirmedUsers = new Set(confirmed.map(person => person.userId))
    const webinarOnly = roster.filter(person => person.status === 'confirmed' && !(person.userId && confirmedUsers.has(person.userId)))
    return [...confirmed, ...webinarOnly].filter(person => met(person.attendance)).length
}

function analyseQuestions(evidence: EditionReportEvidence, firstAttempts: EditionAttemptEvidence[]): EditionReport['questions'] {
    if (evidence.questions.length === 0) return null
    const voided = evidence.questions.filter(question => question.voided_at).length
    const base = { total: evidence.questions.length, voided, firstAttempts: firstAttempts.length, voidingTracked: evidence.voidingTracked }
    // Without the options there is no way to tell a right answer from a wrong one.
    if (evidence.options.length === 0) return { ...base, analyzable: false, rows: [] }

    const options = new Map(evidence.options.map(option => [option.id, option]))
    const tally = new Map(evidence.questions.map(question => [question.id, new Map<string, number>()]))
    for (const attempt of firstAttempts) {
        if (!Array.isArray(attempt.answers)) continue
        for (const answer of attempt.answers as Array<{ question_id?: unknown; selected_option_id?: unknown }>) {
            if (typeof answer?.question_id !== 'string' || typeof answer.selected_option_id !== 'string') continue
            const counts = tally.get(answer.question_id)
            if (!counts || options.get(answer.selected_option_id)?.question_id !== answer.question_id) continue
            counts.set(answer.selected_option_id, (counts.get(answer.selected_option_id) ?? 0) + 1)
        }
    }

    const rows = evidence.questions.map((question, index): EditionQuestionRow => {
        const counts = Array.from(tally.get(question.id) ?? [])
        const answered = counts.reduce((sum, [, count]) => sum + count, 0)
        const correct = counts.filter(([id]) => options.get(id)?.is_correct).reduce((sum, [, count]) => sum + count, 0)
        const [topWrong] = counts.filter(([id]) => !options.get(id)?.is_correct).sort((a, b) => b[1] - a[1])
        return {
            id: question.id, number: index + 1, text: question.question_text, voided: Boolean(question.voided_at),
            correct, answered, correctPercent: percent(correct, answered),
            topWrongAnswer: topWrong ? options.get(topWrong[0])?.option_text ?? null : null, topWrongCount: topWrong?.[1] ?? 0,
        }
    }).sort((a, b) => (a.correctPercent ?? 101) - (b.correctPercent ?? 101) || a.number - b.number)
    return { ...base, analyzable: true, rows }
}

/** Aggregates one edition for M11. Output holds counts and course content only:
 * no names, addresses or user identifiers, so it can be exported as it is. */
export function buildEditionReport(
    run: AcademyRunDTO,
    participants: AcademyRunParticipantDTO[],
    roster: WebinarRosterRow[],
    summary: EditionSummary,
    survey: EditionSurveyReport,
    evidence: EditionReportEvidence,
): EditionReport {
    const confirmedEnrollments = new Set(participants.filter(person => person.status === 'confirmed' && person.enrollmentId).map(person => person.enrollmentId as string))
    const attemptsByEnrollment = new Map<string, EditionAttemptEvidence[]>()
    for (const attempt of evidence.attempts) {
        if (!confirmedEnrollments.has(attempt.enrollment_id)) continue
        attemptsByEnrollment.set(attempt.enrollment_id, [...(attemptsByEnrollment.get(attempt.enrollment_id) ?? []), attempt])
    }

    const people = Array.from(attemptsByEnrollment.values(), rows => {
        const sorted = [...rows].sort(byTime)
        const scored = sorted.filter(attempt => !isPreTest(attempt))
        return { firstPre: sorted.find(isPreTest) ?? null, first: scored[0] ?? null, passedLater: scored.slice(1).some(attempt => attempt.passed) }
    })
    const scoredPeople = people.filter((person): person is typeof person & { first: EditionAttemptEvidence } => person.first !== null)

    const hasQuiz = evidence.quizRequired || evidence.questions.length > 0 || scoredPeople.length > 0
    const passedFirst = scoredPeople.filter(person => person.first.passed).length
    const passedLater = scoredPeople.filter(person => !person.first.passed && person.passedLater).length
    const quiz: EditionReport['quiz'] = hasQuiz ? {
        passPercent: evidence.passPercent, attempted: scoredPeople.length,
        averageFirstScore: average(scoredPeople.map(person => person.first.score_percent)),
        passedFirst, passedLater, notPassed: scoredPeople.length - passedFirst - passedLater, passedTotal: passedFirst + passedLater,
    } : null

    const paired = people.filter(person => person.firstPre && person.first)
    const before = average(paired.map(person => (person.firstPre as EditionAttemptEvidence).score_percent))
    const after = average(paired.map(person => (person.first as EditionAttemptEvidence).score_percent))
    const preTest: EditionReport['preTest'] = evidence.preTestTracked ? {
        tracked: true, solved: people.filter(person => person.firstPre).length, both: paired.length,
        before, after, gain: before !== null && after !== null ? after - before : null,
    } : { tracked: false }

    const present = presentCount(run, participants, roster, summary)
    const firstStart = run.sessions.filter(session => session.status === 'scheduled')
        .map(session => Date.parse(session.actualStartsAt ?? session.startsAt)).filter(Number.isFinite).sort((a, b) => a - b)[0]
    const reportsStart = evidence.reportsStartAt ? Date.parse(evidence.reportsStartAt) : NaN
    // Until the owner sets a start date, everything in the system is rehearsal data.
    const rehearsal = evidence.rehearsalCourse || !Number.isFinite(reportsStart) || firstStart === undefined || firstStart < reportsStart

    return {
        rehearsal, registered: summary.registrations, present,
        presentPercent: present === null ? null : percent(present, summary.registrations),
        passedTotal: quiz?.passedTotal ?? null,
        passedOfPresentPercent: quiz && present !== null ? percent(quiz.passedTotal, present) : null,
        surveyResponses: survey.responseCount,
        surveyOfPresentPercent: present === null ? null : percent(survey.responseCount, present),
        surveyOverall: survey.overall,
        quiz, preTest,
        documents: {
            certificates: participants.filter(person => person.status === 'confirmed' && person.completionState === 'completed').length,
            participationDocuments: evidence.participationDocuments,
        },
        questions: analyseQuestions(evidence, scoredPeople.map(person => person.first)),
    }
}

const WAITING_FOR_MIGRATION = 'czeka na migrację'
const NO_DATA = 'brak danych'

function csvCell(value: string | number | null) {
    let text = String(value ?? '')
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
}
const withPercent = (value: number | null, whole: number | null) => value === null ? NO_DATA : whole === null ? String(value) : `${value} (${whole}%)`
const orNoData = (value: number | null, suffix = '') => value === null ? NO_DATA : `${value}${suffix}`

/** Spreadsheet export of the same aggregates that the screen shows. */
export function editionReportCsv({ courseTitle, runTitle, generatedAt, report, survey }: {
    courseTitle: string; runTitle: string; generatedAt: string; report: EditionReport; survey: EditionSurveyReport
}) {
    const { quiz, preTest, documents, questions } = report
    const rows: Array<Array<string | number | null>> = [
        ['Sekcja', 'Miara', 'Wartość'],
        ['Edycja', 'Szkolenie', courseTitle], ['Edycja', 'Edycja', runTitle], ['Edycja', 'Stan danych', generatedAt],
        ['Edycja', 'Status danych', report.rehearsal ? 'próba (dane sprzed daty startu raportów)' : 'dane właściwe'],
        ['Uczestnicy', 'Zapisani', report.registered],
        ['Uczestnicy', 'Obecni', withPercent(report.present, report.presentPercent)],
        ['Uczestnicy', 'Wypełnili ankietę', withPercent(report.surveyResponses, report.surveyOfPresentPercent)],
    ]
    if (quiz) rows.push(
        ['Test', 'Próg zaliczenia', orNoData(quiz.passPercent, '%')], ['Test', 'Podeszło do testu', quiz.attempted],
        ['Test', 'Średni wynik pierwszego podejścia', orNoData(quiz.averageFirstScore, '%')],
        ['Test', 'Zdało od razu', quiz.passedFirst], ['Test', 'Zdało później', quiz.passedLater], ['Test', 'Nie zdało', quiz.notPassed],
    )
    else rows.push(['Test', 'Stan', 'edycja bez testu'])
    if (preTest.tracked) rows.push(
        ['Pre-test', 'Rozwiązało pre-test', preTest.solved], ['Pre-test', 'Mają oba wyniki', preTest.both],
        ['Pre-test', 'Przed', orNoData(preTest.before, '%')], ['Pre-test', 'Po', orNoData(preTest.after, '%')],
        ['Pre-test', 'Przyrost', orNoData(preTest.gain, ' p.p.')],
    )
    else rows.push(['Pre-test', 'Stan', WAITING_FOR_MIGRATION])
    rows.push(
        ['Dokumenty', 'Certyfikaty', documents.certificates],
        ['Dokumenty', 'Zaświadczenia udziału', documents.participationDocuments ?? WAITING_FOR_MIGRATION],
        ['Ankieta', 'Odpowiedzi', survey.responseCount], ['Ankieta', 'Ocena szkolenia', orNoData(survey.overall)],
        ['Ankieta', 'Ocena prowadzącego', orNoData(survey.trainer)], ['Ankieta', 'Ocena materiałów', orNoData(survey.materials)],
        ['Ankieta', 'Trudność: zbyt łatwe', survey.difficulty.too_easy], ['Ankieta', 'Trudność: odpowiednie', survey.difficulty.appropriate],
        ['Ankieta', 'Trudność: zbyt trudne', survey.difficulty.too_hard],
        ...survey.futureTopics.map((topic): Array<string | number | null> => ['Ankieta', 'Propozycja tematu', topic]),
    )
    if (questions?.analyzable) rows.push(
        [],
        ['Pytanie', 'Treść', 'Odsetek poprawnych', 'Poprawne', 'Odpowiedzi', 'Najczęstsza zła odpowiedź', 'Liczba wskazań', 'Status'],
        ...questions.rows.map(row => [
            row.number, row.text, orNoData(row.correctPercent, '%'), row.correct, row.answered,
            row.topWrongAnswer, row.topWrongCount, row.voided ? 'unieważnione' : 'w punktacji',
        ]),
    )
    return '﻿' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
}
