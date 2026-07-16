import Link from 'next/link'
import { listExitInterviews } from '@/lib/actions/lifecycle'
import { listBench, listExitDepartures } from '@/lib/actions/contractors'
import { ExitSection } from './ContractorSections'

// People Ops — zakładka Exit: obie populacje.
// Pracownicy = exit_interviews do przeglądu (reuse listExitInterviews + detail /internal/lifecycle/exit/[id]).
// Kontraktorzy = zejścia + exit interview + Bench (reuse ExitPanel via klientowy wrapper).
export async function ExitTabPanel() {
    // Awaria jednego źródła ≠ pusty stan (audyt P1.7): bench pokazuje jawny
    // błąd sekcji zamiast udawać pustą listę; reszta zakładki renderuje się.
    const [employeeExits, benchResult, departures] = await Promise.all([
        listExitInterviews({ status: 'submitted' }),
        listBench().then(
            (data) => ({ ok: true as const, data }),
            (err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : 'Błąd benchu' }),
        ),
        listExitDepartures(),
    ])

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Pracownicy wewnętrzni — exit interviews do przeglądu</h2>
                {employeeExits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Brak exit interviews oczekujących na przegląd.</p>
                ) : (
                    <div className="space-y-2">
                        {employeeExits.map((e) => (
                            <Link
                                key={e.id}
                                href={`/internal/lifecycle/exit/${e.id}`}
                                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:bg-muted"
                            >
                                <span className="font-medium text-foreground">
                                    {e.user_full_name ?? e.user_email ?? 'Anonimowy'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {e.submitted_at ? new Date(e.submitted_at).toLocaleDateString('pl-PL') : '—'}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Kontraktorzy — zejścia, exit interview, bench</h2>
                {!benchResult.ok && (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        Nie udało się załadować benchu: {benchResult.error}. Zejścia i wywiady poniżej są kompletne.
                    </p>
                )}
                <ExitSection bench={benchResult.ok ? benchResult.data : []} departures={departures} />
            </section>
        </div>
    )
}
