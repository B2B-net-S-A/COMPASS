import { listNexusMatchQueue } from '@/lib/actions/nexus-identity'
import { NexusIdentityQueue } from '@/components/internal/people/NexusIdentityQueue'

/**
 * Zakładka „Tożsamość NEXUS" w People Ops (Etap 2c integracji).
 *
 * Cron pobiera kontraktorów z NEXUSA i linkuje ich AUTOMATEM wyłącznie przy
 * jednoznacznym e-mailu. Reszta ląduje tutaj — a dziś to praktycznie wszyscy,
 * bo 689 kontraktorów COMPASSA ma zero e-maili i jest identyfikowanych po
 * samym nazwisku.
 */
export async function NexusIdentityTabPanel() {
    const result = await listNexusMatchQueue()

    // Awaria odczytu NIE może renderować się jako pusta kolejka — „nic nie
    // czeka" i „nie wiem, co czeka" to dwa różne zdania, a pierwsze zamyka
    // temat, którego nikt potem nie otworzy.
    if (!result.success) {
        return (
            <p role="alert" className="text-sm text-destructive">
                Nie udało się wczytać kolejki dopasowania: {result.error}
            </p>
        )
    }

    // Znany stan przejściowy: kod jest wdrożony, migracja jeszcze nie.
    // Mówimy o tym wprost — czerwony błąd sugerowałby awarię, na którą zespół
    // TCM i tak nic nie poradzi.
    if (result.data.migrationPending) {
        return (
            <p className="max-w-2xl text-sm text-muted-foreground">
                Integracja z NEXUSEM czeka na migrację bazy. Kolejka pojawi się tutaj,
                gdy migracja zostanie zaaplikowana i przejdzie pierwsza synchronizacja.
            </p>
        )
    }

    return (
        <div className="space-y-4">
            <p className="max-w-2xl text-sm text-muted-foreground">
                Kontraktorzy, których nie dało się jednoznacznie powiązać z NEXUSEM.
                Automat wiąże tylko po e-mailu — dopasowanie po nazwisku jest świadomie
                zabronione, bo sklejenie dwóch różnych osób jest ciche i trwałe.
            </p>
            <NexusIdentityQueue rows={result.data.rows} />
        </div>
    )
}
