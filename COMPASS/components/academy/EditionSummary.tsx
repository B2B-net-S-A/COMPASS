import { listAcademyWebinarRoster } from '@/lib/actions/academy-webinar-import'
import { getEditionSurveyReport } from '@/lib/actions/academy-surveys'
import { buildEditionSummary } from '@/lib/academy/edition-summary'
import { editionSummaryText } from '@/lib/academy/edition-summary-report'
import { buildEditionReport, type EditionReport } from '@/lib/academy/edition-report'
import { loadEditionReportEvidence } from '@/lib/academy/edition-report-server'
import { academyClient } from '@/lib/academy/server'
import { logger } from '@/lib/logger'
import type { AcademyRunDTO, AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import { EditionReportCsvButton } from './EditionReportCsvButton'
import { EditionReportView } from './EditionReportView'
import { EditionSummaryDownload } from './EditionSummaryDownload'

const dataTime = (iso: string) => new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' })

export async function EditionSummary({ run, participants }: { run: AcademyRunDTO; participants: AcademyRunParticipantDTO[] }) {
    const [roster, survey] = await Promise.all([listAcademyWebinarRoster(run.id), getEditionSurveyReport(run.id)])
    if (!roster.success || !survey.success) return <p role="alert" className="text-sm text-destructive">Nie udało się pobrać pełnego podsumowania edycji. Odśwież stronę; brak danych nie jest zerowym wynikiem.</p>
    const generatedAt = new Date().toISOString()
    let summary
    try { summary = buildEditionSummary(run, participants, roster.data, generatedAt) }
    catch { return <p role="alert" className="text-sm text-destructive">Lista zapisów zmieniła się podczas pobierania raportu lub jest niepełna. Odśwież stronę, aby zobaczyć spójne podsumowanie.</p> }

    // A failed quiz read costs only its own part: the attendance summary above it
    // existed before this report and has to keep working without it.
    let report: EditionReport | null = null
    try {
        const evidence = await loadEditionReportEvidence(academyClient(), run, participants)
        report = buildEditionReport(run, participants, roster.data, summary, survey.data, evidence)
    } catch (error) {
        logger.error({ event: 'academy.edition_report.failed', runId: run.id, error })
    }

    const attendance = summary.sessions.length === 0 ? <p className="text-sm text-muted-foreground">Brak aktywnych spotkań do podsumowania frekwencji.</p> : <div className="overflow-x-auto">
        <table className="w-full text-left text-sm"><caption className="sr-only">Frekwencja według spotkań</caption>
            <thead><tr><th className="p-2">Spotkanie</th><th className="p-2">Zarejestrowany udział</th><th className="p-2">Spełnia próg</th><th className="p-2">Poniżej progu</th><th className="p-2">Brak danych / weryfikacja</th></tr></thead>
            <tbody>{summary.sessions.map(session => <tr key={session.id} className="border-t border-border">
                <th scope="row" className="p-2 font-normal">{session.title}{!session.windowConfirmed && <span className="block text-xs text-muted-foreground">Oczekuje na zakończenie i potwierdzenie czasu zajęć</span>}</th>
                <td className="p-2">{session.windowConfirmed ? `${session.observed} (${session.observedPercent === null ? '—' : `${session.observedPercent}%`})` : '—'}</td>
                <td className="p-2">{session.windowConfirmed ? session.meetsThreshold : '—'}</td><td className="p-2">{session.windowConfirmed ? session.belowThreshold : '—'}</td><td className="p-2">{session.unverified}</td>
            </tr>)}</tbody>
        </table>
    </div>

    return <section aria-labelledby="edition-summary-title" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 id="edition-summary-title" className="text-lg font-semibold">Raport edycji</h2><p className="text-sm text-muted-foreground">Stan danych: {dataTime(generatedAt)}</p></div>
            {report && <EditionReportCsvButton runId={run.id} />}
        </div>
        {report ? <EditionReportView report={report} survey={survey.data} attendance={attendance} /> : <>
            <p role="alert" className="text-sm text-destructive">Nie udało się pobrać wyników testu i dokumentów tej edycji. Odśwież stronę; brak danych nie jest zerowym wynikiem.</p>
            {attendance}
        </>}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
                ['Potwierdzone miejsca', summary.registrations], ['Zapisy Compass', summary.compassRegistrations],
                ['Miejsca webinaru bez zapisu Compass', summary.webinarOnlyRegistrations], ['Osoby bez konta Compass', summary.noCompassAccount],
                ['Rezerwa Compass', summary.waitlisted], ['Odpowiedzi ankiety Compass', survey.data.responseCount],
            ].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}
        </dl>
        <p className="text-sm text-muted-foreground">Potwierdzone osoby z Compass i listy webinaru liczymy raz. Ankieta obejmuje odpowiedzi kont Compass; osoby bez konta nie mają obecnie formularza w panelu.</p>
        <p className="text-xs text-muted-foreground">Udział oznacza dodatni zarejestrowany czas połączenia. Brak raportu nie oznacza nieobecności; spełnienie progu obecności nie oznacza ukończenia programu. Szczegóły sześciu obszarów ankiety znajdziesz poniżej.</p>
        <EditionSummaryDownload runId={run.id} text={editionSummaryText(run.courseTitle, run.title, summary, survey.data, generatedAt)} />
    </section>
}
