import type { EditionSummary } from '@/lib/academy/edition-summary'
import type { EditionSurveyReport } from '@/lib/types/academy-surveys'

export function editionSummaryText(courseTitle: string, runTitle: string, summary: EditionSummary, survey: EditionSurveyReport, generatedAt: string) {
    const rating = (value: number | null) => value === null ? 'brak odpowiedzi' : `${value} / 5`
    return [
        courseTitle, runTitle, `Stan danych: ${generatedAt}`, '',
        `Potwierdzone miejsca (Compass i webinar, bez duplikatów): ${summary.registrations}`,
        `Potwierdzone zapisy Compass: ${summary.compassRegistrations}`,
        `Miejsca webinaru bez potwierdzonego zapisu Compass: ${summary.webinarOnlyRegistrations}`,
        `Osoby bez konta Compass: ${summary.noCompassAccount}`,
        `Rezerwa Compass: ${summary.waitlisted}`, '',
        'FREKWENCJA WEDŁUG SPOTKAŃ',
        ...summary.sessions.flatMap(session => [
            session.title,
            `Potwierdzone zakończone okno zajęć: ${session.windowConfirmed ? 'tak' : 'nie'}`,
            `Zarejestrowany udział (> 0 sekund): ${session.observed}; udział względem zapisów: ${session.observedPercent === null ? 'jeszcze nieustalony' : `${session.observedPercent}%`}`,
            `Spełnia próg obecności: ${session.meetsThreshold}; poniżej progu: ${session.belowThreshold}; brak danych lub do weryfikacji: ${session.unverified}`, '',
        ]),
        'Brak raportu lub czasu obecności nie oznacza nieobecności. Frekwencja nie oznacza ukończenia programu.', '',
        'ANKIETA EDYCJI — ODPOWIEDZI COMPASS',
        `Odpowiedzi: ${survey.responseCount}`,
        `Ocena szkolenia: ${rating(survey.overall)}`,
        `Ocena prowadzącego: ${rating(survey.trainer)}`,
        `Ocena materiałów: ${rating(survey.materials)}; liczba ocen: ${survey.materialsResponseCount}`,
        `Trudność: zbyt łatwe ${survey.difficulty.too_easy}, odpowiednie ${survey.difficulty.appropriate}, zbyt trudne ${survey.difficulty.too_hard}`,
        'Propozycje tematów:', ...(survey.futureTopics.length ? survey.futureTopics : ['brak propozycji']),
        survey.teachingInterests ? `Deklaracje chęci prowadzenia: ${survey.teachingInterests.length}` : 'Deklaracje chęci prowadzenia: dostępne tylko administratorowi',
        `Średnia rekomendacja (0–10): ${survey.nps ?? 'brak odpowiedzi'}`, '',
        'Osoby bez konta Compass nie odpowiadają na tę ankietę. Nie przedstawiaj jej jako opinii wszystkich zapisanych na webinar.',
    ].join('\r\n')
}
