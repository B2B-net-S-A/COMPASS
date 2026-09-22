import { z } from 'zod'

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.string().datetime({ offset: true }).nullable()
export const operationsSnapshotSchema = z.object({
    checkedAt: z.string().datetime({ offset: true }),
    workers: z.array(z.object({ kind: z.enum(['materials', 'sync']), lastFinishedAt: timestamp, ok: z.boolean() })).length(2),
    materials: z.object({ pending: counter, failed: counter, oldestDueAt: timestamp }),
    integrations: z.object({ pending: counter, failed: counter, oldestDueAt: timestamp }),
    storage: z.object({ reservedBytes: counter, authorsNearQuota: counter }),
}).refine(value => new Set(value.workers.map(worker => worker.kind)).size === 2)
export type OperationsSnapshot = z.infer<typeof operationsSnapshotSchema>
export type AcademyHealthAlert = { code: string; severity: 'warning' | 'critical'; message: string; owner: string }
export type AcademyOperationsHealth = OperationsSnapshot & {
    status: 'healthy' | 'degraded' | 'unhealthy'
    alerts: AcademyHealthAlert[]
    scanner: { available: boolean; databaseUpdatedAt: string | null }
}

/** No raw errors or job data leave this projection. A successful old run cannot mask a recent failure. */
export function evaluateAcademyOperations(snapshot: OperationsSnapshot, scanner: AcademyOperationsHealth['scanner']): AcademyOperationsHealth {
    const now = Date.parse(snapshot.checkedAt)
    const alerts: AcademyHealthAlert[] = []
    for (const worker of snapshot.workers) {
        const age = worker.lastFinishedAt ? now - Date.parse(worker.lastFinishedAt) : Infinity
        const label = worker.kind === 'materials' ? 'Skanowanie materiałów' : 'Synchronizacja Akademii'
        if (!worker.ok || age > 15 * 60_000 || age < -60_000) alerts.push({ code: `${worker.kind}_worker_unhealthy`, severity: 'critical', message: `${label}: brak aktualnego poprawnego wykonania. Sprawdź harmonogram i wynik zadania.`, owner: 'Operator techniczny' })
        else if (age > 5 * 60_000) alerts.push({ code: `${worker.kind}_worker_delayed`, severity: 'warning', message: `${label}: ostatnie wykonanie jest starsze niż 5 minut. Sprawdź, czy trwa wdrożenie lub konserwacja.`, owner: 'Operator techniczny' })
    }
    for (const [kind, queue] of [['materials', snapshot.materials], ['integrations', snapshot.integrations]] as const) {
        const label = kind === 'materials' ? 'Weryfikacja materiałów' : 'Synchronizacja spotkań i obecności'
        if (queue.failed) alerts.push({ code: `${kind}_exhausted`, severity: 'critical', message: `${label}: ${queue.failed} operacji wymaga interwencji. Sprawdź kolejkę poniżej.`, owner: 'Administrator Akademii' })
        if (queue.oldestDueAt && now - Date.parse(queue.oldestDueAt) > 30 * 60_000) alerts.push({ code: `${kind}_overdue`, severity: 'critical', message: `${label}: zadanie oczekuje ponad 30 minut od terminu wykonania.`, owner: 'Operator techniczny' })
    }
    if (!scanner.available || !scanner.databaseUpdatedAt) alerts.push({ code: 'scanner_unavailable', severity: 'warning', message: 'Nie potwierdzono gotowości skanera. Nowe pliki pozostają niedostępne do pozytywnej weryfikacji. Sprawdź aktualizację lub wdrożenie.', owner: 'Operator techniczny' })
    else if (now - Date.parse(scanner.databaseUpdatedAt) >= 24 * 60 * 60_000) alerts.push({ code: 'scanner_signatures_aging', severity: 'warning', message: 'Sygnatury skanera mają co najmniej 24 godziny. Sprawdź aktualizację; po 48 godzinach skanowanie jest blokowane.', owner: 'Operator techniczny' })
    if (snapshot.storage.authorsNearQuota) alerts.push({ code: 'author_storage_near_quota', severity: 'warning', message: `${snapshot.storage.authorsNearQuota} autorów wykorzystuje co najmniej 80% limitu materiałów. Ustal dalsze postępowanie przed wyczerpaniem miejsca.`, owner: 'Administrator Akademii' })
    return { ...snapshot, scanner, alerts, status: alerts.some(alert => alert.severity === 'critical') ? 'unhealthy' : alerts.length ? 'degraded' : 'healthy' }
}
