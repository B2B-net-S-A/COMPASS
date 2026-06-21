import Link from 'next/link'
import { listOnboardingQueue } from '@/lib/actions/lifecycle'
import { listOnboardingEntries } from '@/lib/actions/contractors'
import { OnboardingEntriesSection } from './ContractorSections'

// People Ops — zakładka Onboarding: obie populacje w jednym widoku.
// Pracownicy = kolejka onboarding_progress (reuse listOnboardingQueue + detail /internal/lifecycle/onboarding/[id]).
// Kontraktorzy = wpisy wejść/wywiady (reuse OnboardingEntriesPanel via klientowy wrapper).
export async function OnboardingTabPanel() {
    const [employeeQueue, contractorEntries] = await Promise.all([
        listOnboardingQueue({ status: 'in_progress' }),
        listOnboardingEntries(),
    ])

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Pracownicy wewnętrzni</h2>
                {employeeQueue.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Brak aktywnych onboardingów pracowników.</p>
                ) : (
                    <div className="space-y-2">
                        {employeeQueue.map((r) => (
                            <Link
                                key={r.progress_id}
                                href={`/internal/lifecycle/onboarding/${r.progress_id}`}
                                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:bg-muted"
                            >
                                <div>
                                    <div className="font-medium text-foreground">{r.full_name ?? r.email}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {r.tasks_completed} / {r.tasks_total} zadań
                                        {r.tasks_overdue > 0 && (
                                            <span className="ml-2 text-red-500">• {r.tasks_overdue} po terminie</span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(r.started_at).toLocaleDateString('pl-PL')}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Kontraktorzy</h2>
                <OnboardingEntriesSection entries={contractorEntries} />
            </section>
        </div>
    )
}
