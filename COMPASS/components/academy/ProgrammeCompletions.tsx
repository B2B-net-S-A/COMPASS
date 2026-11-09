import type { ActionResult } from '@/lib/actions/action-result'
import type { ProgrammeCompletion } from '@/lib/actions/academy-reports'

/** Podsumowanie programów pod raportem kompetencji (B4.8): szkolenie na żywo i kurs z modułów liczą osobę raz. */
export function ProgrammeCompletions({ result }: { result: ActionResult<{ migrated: boolean; programmes: ProgrammeCompletion[] }> }) {
    return <section aria-labelledby="programme-completions" className="rounded-xl border border-border bg-card">
        <div className="space-y-1 p-3">
            <h2 id="programme-completions" className="text-sm font-semibold">Programy</h2>
            <p className="text-sm text-muted-foreground">Osoba, która ukończyła szkolenie na żywo i kurs z modułów tego samego programu, liczy się raz.</p>
        </div>
        {!result.success ? <p role="alert" className="border-t border-border p-4 text-sm text-destructive">{result.error}</p>
            : !result.data.migrated ? <p className="border-t border-border p-4 text-sm text-muted-foreground">Podsumowanie programów czeka na migrację bazy danych.</p>
            : result.data.programmes.length === 0 ? <p className="border-t border-border p-4 text-sm text-muted-foreground">Żaden kurs nie jest jeszcze przypisany do programu.</p>
            : <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-left text-sm">
                    <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Program</th><th className="p-2 text-right font-medium">Kursy w programie</th><th className="p-2 text-right font-medium">Ukończyło osób</th></tr></thead>
                    <tbody>{result.data.programmes.map(programme => <tr key={programme.programme_id} className="border-t border-border">
                        <th scope="row" className="p-2 font-medium">{programme.title}</th>
                        <td className="p-2 text-right tabular-nums">{programme.courses}</td>
                        <td className="p-2 text-right tabular-nums">{programme.completed_users}</td>
                    </tr>)}</tbody>
                </table>
            </div>}
    </section>
}
