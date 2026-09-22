'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/types/learning'
import type { AcademyOperationsHealth as Health } from '@/lib/academy/operations-health'

function date(value: string | null) {
    return value ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Warsaw' }).format(new Date(value)) : 'Brak potwierdzonego wykonania'
}
const labels = { healthy: 'Zadania działają prawidłowo', degraded: 'Sprawdź ostrzeżenia', unhealthy: 'Wymagana interwencja' }
export function AcademyOperationsHealth({ result }: { result: ActionResult<Health> }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    return <section aria-labelledby="academy-operations-heading" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="academy-operations-heading" className="flex items-center gap-2 text-lg font-semibold"><Activity aria-hidden="true" className="size-5" />Działanie zadań Akademii</h2><p className="text-sm text-muted-foreground">Stan harmonogramów, kolejek i weryfikacji plików.</p></div><Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw aria-hidden="true" className={pending ? 'animate-spin' : ''} />Odśwież stan zadań</Button></div>
        {!result.success ? <p role="alert" className="text-sm text-destructive">Nie udało się sprawdzić działania zadań. Nie oznacza to pustej kolejki ani prawidłowego stanu. Operator techniczny powinien sprawdzić połączenie i monitoring.</p> : <>
            <p className={`font-medium ${result.data.status === 'unhealthy' ? 'text-destructive' : result.data.status === 'healthy' ? 'text-success' : 'text-foreground'}`}>{labels[result.data.status]}</p>
            <p className="text-xs text-muted-foreground">Odczyt: {date(result.data.checkedAt)} (Europe/Warsaw). Odśwież, aby pobrać aktualny stan.</p>
            {result.data.alerts.length > 0 && <ul role="alert" className="space-y-2">{result.data.alerts.map(alert => <li key={alert.code} className={`rounded-lg border p-3 text-sm ${alert.severity === 'critical' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/30'}`}><p>{alert.message}</p><p className="mt-1 text-xs text-muted-foreground">Odpowiedzialny: {alert.owner}</p></li>)}</ul>}
            <dl className="grid gap-4 text-sm sm:grid-cols-2">{result.data.workers.map(worker => <div key={worker.kind}><dt className="font-medium">{worker.kind === 'materials' ? 'Skanowanie materiałów' : 'Synchronizacja i przypomnienia'}</dt><dd className="text-muted-foreground">{date(worker.lastFinishedAt)}{worker.lastFinishedAt && (worker.ok ? ' · poprawny wynik' : ' · nieudane wykonanie')}</dd></div>)}<div><dt className="font-medium">Kolejki oczekujące</dt><dd className="text-muted-foreground">Materiały: {result.data.materials.pending} · Integracje: {result.data.integrations.pending}</dd></div><div><dt className="font-medium">Rezerwacja przestrzeni</dt><dd className="text-muted-foreground">{(result.data.storage.reservedBytes / 1024 ** 3).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} GB · Autorzy powyżej 80% limitu: {result.data.storage.authorsNearQuota}</dd></div><div><dt className="font-medium">Sygnatury skanera</dt><dd className="text-muted-foreground">{result.data.scanner.available ? date(result.data.scanner.databaseUpdatedAt) : 'Gotowość niepotwierdzona'}</dd></div></dl>
            <p className="text-xs text-muted-foreground">Poprawny przebieg pustej kolejki nie potwierdza przeskanowania materiału ani odbycia spotkania. Odbiór szkolenia wymaga rzeczywistego przejścia uczestnika.</p>
        </>}
    </section>
}
