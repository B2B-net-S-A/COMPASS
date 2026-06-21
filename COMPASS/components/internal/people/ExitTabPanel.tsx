import Link from 'next/link'
import { listExitInterviews } from '@/lib/actions/lifecycle'
import { listBench, listExitDepartures } from '@/lib/actions/contractors'
import { ExitSection } from './ContractorSections'

// People Ops — zakładka Exit: obie populacje.
// Pracownicy = exit_interviews do przeglądu (reuse listExitInterviews + detail /internal/lifecycle/exit/[id]).
// Kontraktorzy = zejścia + exit interview + Bench (reuse ExitPanel via klientowy wrapper).
export async function ExitTabPanel() {
    const [employeeExits, bench, departures] = await Promise.all([
        listExitInterviews({ status: 'submitted' }),
        listBench(),
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
                <ExitSection bench={bench} departures={departures} />
            </section>
        </div>
    )
}
