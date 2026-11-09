import type { ReactNode } from 'react'
import type { EditionReport, EditionQuestionRow } from '@/lib/academy/edition-report'
import type { EditionSurveyReport } from '@/lib/types/academy-surveys'
import { EditionQuestionVoid } from './EditionQuestionVoid'

const VISIBLE_QUESTIONS = 6
const NO_DATA = '—'
const WAITING = 'czeka na migrację'
const decimal = (value: number) => value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pct = (value: number | null) => value === null ? NO_DATA : `${value}%`

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
    return <div className="rounded-xl border border-border bg-card p-4">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}<p className="mt-1 text-xs font-normal text-muted-foreground">{hint}</p></dd>
    </div>
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return <div className="flex flex-col gap-3 border-t border-border p-4 first:border-t-0 md:flex-row md:gap-5">
        <div className="md:w-52 md:flex-none"><h3 className="font-semibold">{title}</h3>{hint && <p className="text-sm text-muted-foreground">{hint}</p>}</div>
        <div className="min-w-0 flex-1">{children}</div>
    </div>
}

function Facts({ items }: { items: Array<[string, ReactNode]> }) {
    return <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
}

const KEY_CHECK_BELOW_PERCENT = 50

function QuestionRow({ row, courseId, voidingTracked }: { row: EditionQuestionRow; courseId: string; voidingTracked: boolean }) {
    return <tr className="border-t border-border align-top">
        <th scope="row" className="p-2 font-normal">
            <span className="block text-xs text-muted-foreground">Pytanie {row.number}{row.voided && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">Unieważnione</span>}{!row.voided && row.correctPercent !== null && row.correctPercent < KEY_CHECK_BELOW_PERCENT && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">Sprawdź klucz odpowiedzi</span>}</span>
            {row.text}
            {row.voided && row.voidReason && <span className="block text-xs text-muted-foreground">{row.voidReason}</span>}
        </th>
        <td className="p-2 tabular-nums">{row.correctPercent === null ? 'brak odpowiedzi' : <>{row.correctPercent}%<span className="block text-xs text-muted-foreground">{row.correct} z {row.answered}{row.voided ? ', poza punktacją' : ''}</span></>}</td>
        <td className="p-2">{row.topWrongAnswer ? <>{row.topWrongAnswer}<span className="block text-xs text-muted-foreground">{row.topWrongCount} z {row.answered} osób</span></> : NO_DATA}</td>
        {voidingTracked && <td className="p-2 text-right">{!row.voided && <EditionQuestionVoid courseId={courseId} questionId={row.id} questionNumber={row.number} />}</td>}
    </tr>
}

function QuestionsTable({ questions, courseId }: { questions: NonNullable<EditionReport['questions']>; courseId: string }) {
    if (!questions.analyzable) return <p className="p-4 text-sm text-muted-foreground">Analiza pytań jest niedostępna dla tego konta, bo odpowiedzi tej wersji widzi tylko jej autor i recenzent.</p>
    const visible = questions.rows.slice(0, VISIBLE_QUESTIONS)
    const rest = questions.rows.slice(VISIBLE_QUESTIONS)
    const head = <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Pytanie</th><th className="w-36 p-2 font-medium">Odsetek poprawnych</th><th className="w-56 p-2 font-medium">Najczęstsza zła odpowiedź</th>{questions.voidingTracked && <th className="w-28 p-2"><span className="sr-only">Działania</span></th>}</tr></thead>
    return <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">{head}<tbody>{visible.map(row => <QuestionRow key={row.id} row={row} courseId={courseId} voidingTracked={questions.voidingTracked} />)}</tbody></table></div>
        {rest.length > 0 && <details className="border-t border-border">
            <summary className="cursor-pointer p-3 text-sm font-medium">Pokaż pozostałe ({rest.length})</summary>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">{head}<tbody>{rest.map(row => <QuestionRow key={row.id} row={row} courseId={courseId} voidingTracked={questions.voidingTracked} />)}</tbody></table></div>
        </details>}
        <p className="border-t border-border p-3 text-xs text-muted-foreground">{questions.voidingTracked
            ? 'Unieważnienie usuwa pytanie z punktacji i przelicza zapisane próby. Trafia do dziennika audytu.'
            : 'Unieważnianie pytań będzie dostępne po zastosowaniu migracji.'}</p>
    </>
}

/** Presentational M11 report; every number comes from buildEditionReport. */
export function EditionReportView({ report, survey, attendance, courseId }: { report: EditionReport; survey: EditionSurveyReport; attendance: ReactNode; courseId: string }) {
    const { quiz, preTest, documents, questions } = report
    const surveyHint = [report.surveyOfPresentPercent === null ? null : `${report.surveyOfPresentPercent}% obecnych`, survey.overall === null ? null : `ocena ${decimal(survey.overall)} z 5`].filter(Boolean).join(', ') || 'brak ocen'
    return <div className="space-y-4">
        {report.rehearsal && <p role="status" className="rounded-xl border border-border bg-muted p-3 text-sm"><strong className="font-semibold">Próba.</strong> Dane sprzed daty startu raportów. Nie przedstawiaj ich jako wyników właściwych.</p>}
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Zapisani" value={report.registered} hint="potwierdzone miejsca, bez duplikatów" />
            <Kpi label="Obecni" value={report.present ?? NO_DATA} hint={report.presentPercent === null ? 'czas zajęć niepotwierdzony' : `${report.presentPercent}% zapisanych, spełnili próg obecności`} />
            <Kpi label="Zdali test" value={report.passedTotal ?? NO_DATA} hint={quiz === null ? 'edycja bez testu' : report.passedOfPresentPercent === null ? 'liczba obecnych nieustalona' : `${report.passedOfPresentPercent}% obecnych`} />
            <Kpi label="Wypełnili ankietę" value={report.surveyResponses} hint={surveyHint} />
        </dl>
        <div className="rounded-xl border border-border bg-card">
            <Block title="Wynik pierwszego podejścia" hint={[quiz?.passPercent != null ? `Próg zaliczenia: ${quiz.passPercent}%` : null, report.excludedKeyHolders > 0 ? 'Bez osób z dostępem do klucza.' : null].filter(Boolean).join(' ') || undefined}>
                {quiz === null ? <p className="text-sm text-muted-foreground">Ta edycja nie ma testu.</p> : <Facts items={[
                    ['Średni wynik', pct(quiz.averageFirstScore)],
                    ['Podeszło do testu', report.present === null || quiz.attempted > report.present ? quiz.attempted : `${quiz.attempted} z ${report.present} obecnych`],
                    ['Zdało od razu', quiz.attempted ? `${quiz.passedFirst} (${Math.round(quiz.passedFirst / quiz.attempted * 100)}%)` : 0],
                    ['Zdało później', quiz.passedLater], ['Nie zdało', quiz.notPassed],
                ]} />}
            </Block>
            <Block title="Przyrost z pre-testu" hint="Odsetek poprawnych przed szkoleniem i po nim">
                {preTest.tracked ? <Facts items={[
                    ['Rozwiązało pre-test', `${preTest.solved} z ${report.registered} zapisanych`], ['Mają oba wyniki', preTest.both],
                    ['Przed', pct(preTest.before)], ['Po', pct(preTest.after)],
                    ['Przyrost', preTest.gain === null ? NO_DATA : `${preTest.gain > 0 ? '+' : ''}${preTest.gain} p.p.`],
                ]} /> : <p className="text-sm text-muted-foreground">Pre-test {WAITING}.</p>}
            </Block>
            <Block title="Frekwencja" hint="Brak raportu nie oznacza nieobecności.">{attendance}</Block>
            <Block title="Certyfikaty i zaświadczenia" hint="Certyfikat: obecność i zdany test. Zaświadczenie: sama obecność.">
                <Facts items={[['Certyfikaty', documents.certificates], ['Zaświadczenia udziału', documents.participationDocuments ?? WAITING]]} />
            </Block>
        </div>
        {questions && <div className="rounded-xl border border-border bg-card">
            <div className="p-4"><h3 className="font-semibold">Pytania testu</h3><p className="text-sm text-muted-foreground">Liczba pytań: {questions.total}, unieważnione: {questions.voided}. Pierwsze podejścia: {questions.firstAttempts}. Od najsłabszego.{report.excludedKeyHolders > 0 ? ` Bez wyników osób z dostępem do klucza: ${report.excludedKeyHolders}.` : ''}</p></div>
            <QuestionsTable questions={questions} courseId={courseId} />
        </div>}
        <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Co poprawić</h3>
            <p className="text-sm text-muted-foreground">Odpowiedzi w ankiecie: {survey.responseCount}. Szkolenie {survey.overall === null ? NO_DATA : decimal(survey.overall)}, prowadzący {survey.trainer === null ? NO_DATA : decimal(survey.trainer)}, materiały {survey.materials === null ? NO_DATA : decimal(survey.materials)}. Trudność: zbyt łatwe {survey.difficulty.too_easy}, odpowiednie {survey.difficulty.appropriate}, zbyt trudne {survey.difficulty.too_hard}.</p>
            {survey.futureTopics.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{survey.futureTopics.slice(0, 4).map((topic, index) => <li key={index}>{topic}</li>)}</ul>}
            {survey.futureTopics.length > 4 && <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Pokaż wszystkie propozycje ({survey.futureTopics.length})</summary><ul className="mt-1 list-disc space-y-1 pl-5">{survey.futureTopics.slice(4).map((topic, index) => <li key={index}>{topic}</li>)}</ul></details>}
        </div>
    </div>
}
