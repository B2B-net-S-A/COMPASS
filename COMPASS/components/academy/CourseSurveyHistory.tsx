import Link from 'next/link'
import { getHistoricalCourseSurveys } from '@/lib/actions/academy-surveys'

export async function CourseSurveyHistory() {
    const result = await getHistoricalCourseSurveys()
    return <section className="space-y-3" aria-label="Historyczne ankiety kursów">
        <h2 className="font-semibold">Ankiety kursów samodzielnych i wcześniejsze odpowiedzi</h2>
        <p className="text-sm text-muted-foreground">Te odpowiedzi są przypisane do kursu. Nie łączymy ich z nowymi ankietami poszczególnych edycji live; wyniki edycji znajdziesz na ich stronach.</p>
        {!result.success ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : result.data.length === 0 ? <p className="text-sm text-muted-foreground">Brak wcześniejszych odpowiedzi dla kursów, którymi zarządzasz.</p> : result.data.map(row => <details key={row.courseId} className="rounded-lg border p-4">
            <summary className="cursor-pointer">{row.title} · {row.responseCount} odpowiedzi · rekomendacja {row.averageNps ?? '—'} / 10</summary>
            <Link className="text-sm underline" href={'/learning/tworze/' + row.courseId + '/edycje'}>Ankiety kolejnych edycji</Link>
            <h3 className="mt-3 text-sm font-medium">Najlepsze elementy</h3><ul className="list-disc pl-5 text-sm">{row.bestParts.map((value, i) => <li key={i}>{value}</li>)}</ul>
            <h3 className="mt-3 text-sm font-medium">Propozycje zmian</h3><ul className="list-disc pl-5 text-sm">{row.improvements.map((value, i) => <li key={i}>{value}</li>)}</ul>
        </details>)}
    </section>
}
