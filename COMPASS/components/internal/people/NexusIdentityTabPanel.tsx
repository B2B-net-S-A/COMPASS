import Link from 'next/link'
import { listNexusMatchQueue, type NexusQueueView } from '@/lib/actions/nexus-identity'
import { NexusIdentityQueue } from '@/components/internal/people/NexusIdentityQueue'

/**
 * Zakładka „Tożsamość NEXUS" w People Ops.
 *
 * Cron pobiera kontraktorów z NEXUSA i linkuje ich AUTOMATEM wyłącznie przy
 * e-mailu unikalnym po obu stronach. Reszta ląduje tutaj — z podpowiedziami
 * z ostatniego eksportu NEXUSA, żeby nikt nie musiał szukać i przepisywać ID.
 *
 * Widoki rozdzielają dwa różne „nie ma w NEXUSIE" (audyt integracji 14.09,
 * INT-02): automat, który nikogo nie znalazł w ostatnim biegu, i świadome
 * odrzucenie przez człowieka.
 */

const VIEW_TABS: Array<{ id: NexusQueueView; label: string }> = [
    { id: 'open', label: 'Do rozstrzygnięcia' },
    { id: 'auto_not_found', label: 'Brak w NEXUS (automat)' },
    { id: 'dismissed', label: 'Odrzucone ręcznie' },
    { id: 'linked', label: 'Powiązani' },
]

const VIEW_HINT: Record<NexusQueueView, string> = {
    open:
        'Kontraktorzy z podpowiedzią po nazwisku albo z wieloma trafieniami. Automat wiąże tylko po ' +
        'e-mailu — dopasowanie po nazwisku jest świadomie zabronione, bo sklejenie dwóch różnych osób ' +
        'jest ciche i trwałe.',
    auto_not_found:
        'Automat nie znalazł tych osób w ostatnim eksporcie NEXUSA. To nie jest decyzja — każdy bieg ' +
        'synchronizacji sprawdza je od nowa.',
    dismissed:
        'Osoby, które ktoś świadomie oznaczył jako nieobecne w NEXUSIE. Automat ich nie rusza. ' +
        'Błędną decyzję można cofnąć.',
    linked: 'Kontraktorzy powiązani z osobą w NEXUSIE. Błędne powiązanie można odpiąć.',
}

export async function NexusIdentityTabPanel({ view: rawView }: { view?: string }) {
    const view: NexusQueueView = VIEW_TABS.some((t) => t.id === rawView)
        ? (rawView as NexusQueueView)
        : 'open'
    const result = await listNexusMatchQueue({ view })

    // Awaria odczytu NIE może renderować się jako pusta kolejka — „nic nie
    // czeka" i „nie wiem, co czeka" to dwa różne zdania.
    if (!result.success) {
        return (
            <p role="alert" className="text-sm text-destructive">
                Nie udało się wczytać kolejki dopasowania: {result.error}
            </p>
        )
    }

    // Znany stan przejściowy: kod jest wdrożony, migracja jeszcze nie.
    if (result.data.migrationPending) {
        return (
            <p className="max-w-2xl text-sm text-muted-foreground">
                Integracja z NEXUSEM czeka na migrację bazy. Kolejka pojawi się tutaj,
                gdy migracja zostanie zaaplikowana i przejdzie pierwsza synchronizacja.
            </p>
        )
    }

    const { counts } = result.data
    return (
        <div className="space-y-4">
            <nav aria-label="Widoki tożsamości NEXUS" className="flex flex-wrap gap-2">
                {VIEW_TABS.map((t) => {
                    const active = t.id === view
                    const count = counts[t.id]
                    return (
                        <Link
                            key={t.id}
                            href={`/internal/people?tab=nexus&nexusView=${t.id}`}
                            aria-current={active ? 'page' : undefined}
                            className={
                                active
                                    ? 'rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary'
                                    : 'rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'
                            }
                        >
                            {t.label}
                            {count !== null && <span className="ml-1.5 tabular-nums">({count})</span>}
                        </Link>
                    )
                })}
            </nav>
            <p className="max-w-2xl text-sm text-muted-foreground">{VIEW_HINT[view]}</p>
            {!result.data.snapshotAvailable && view !== 'dismissed' && (
                <p role="status" className="max-w-2xl text-sm text-amber-700">
                    Nie udało się odczytać ostatniego eksportu NEXUSA — podpowiedzi są niedostępne.
                    Numer kontraktu można nadal wpisać ręcznie.
                </p>
            )}
            <NexusIdentityQueue view={view} rows={result.data.rows} />
        </div>
    )
}
