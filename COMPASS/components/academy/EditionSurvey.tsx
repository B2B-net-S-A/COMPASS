import { getEditionSurveyReport, getEditionSurveyState } from '@/lib/actions/academy-surveys'
import { EditionSurveyForm, EditionSurveySettings } from './EditionSurveyForm'

export async function EditionSurvey({ runId, canManage }: { runId: string; canManage: boolean }) {
    const [state, report] = await Promise.all([getEditionSurveyState(runId), canManage ? getEditionSurveyReport(runId) : null])
    return <section aria-label="Ankieta edycji" className="space-y-4">
        {!state.success ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : <>
            {!canManage && <EditionSurveyForm runId={runId} state={state.data} />}
            {canManage && <EditionSurveySettings runId={runId} state={state.data} />}
        </>}
        {report && !report.success && <p role="alert" className="text-sm text-destructive">{report.error}</p>}
        {report?.success && <div className="rounded-lg border p-5 space-y-3">
            <h3 className="font-semibold">Wyniki ankiety tej edycji</h3>
            <p className="text-sm">Odpowiedzi: {report.data.responseCount}</p>
            <dl className="grid gap-3 sm:grid-cols-3">{[['Szkolenie', report.data.overall], ['Prowadzący', report.data.trainer], ['Materiały', report.data.materials]].map(([name, value]) => <div key={name}><dt className="text-sm text-muted-foreground">{name}</dt><dd>{value ?? '—'} / 5</dd></div>)}</dl>
            <p className="text-sm">Materiały oceniło: {report.data.materialsResponseCount}. Rekomendacja (średnia 0–10): {report.data.nps ?? '—'}.</p>
            <p className="text-sm">Trudność: zbyt łatwy {report.data.difficulty.too_easy}, odpowiedni {report.data.difficulty.appropriate}, zbyt trudny {report.data.difficulty.too_hard}.</p>
            {!!report.data.futureTopics.length && <><h4 className="font-medium">Propozycje przyszłych tematów</h4><ul className="list-disc pl-5 text-sm">{report.data.futureTopics.map((topic, i) => <li key={i}>{topic}</li>)}</ul></>}
            {report.data.teachingInterests && <><h4 className="font-medium">Zainteresowanie prowadzeniem — tylko administrator</h4>
                {report.data.teachingInterests.length === 0 ? <p className="text-sm text-muted-foreground">Brak deklaracji.</p> : <ul className="space-y-2 text-sm">{report.data.teachingInterests.map(interest => <li key={interest.userId}>{interest.fullName ?? 'Uczestnik'}: {interest.proposedTopic ?? 'Temat do ustalenia'} · {interest.contactPreference === 'contract_email' ? 'kontakt na adres z umowy B2B' : interest.contactPreference === 'compass' ? 'kontakt w Compass' : 'bez kontaktu na tym etapie'}</li>)}</ul>}
            </>}
            <p className="text-xs text-muted-foreground">Wyniki dotyczą tylko tej edycji; wcześniejsze ankiety kursu samodzielnego pozostają w historycznych wynikach kursu.</p>
        </div>}
    </section>
}
