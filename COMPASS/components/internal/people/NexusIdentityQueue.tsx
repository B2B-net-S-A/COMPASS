'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    dismissNexusMatch,
    linkContractorToNexus,
    type NexusQueueRow,
} from '@/lib/actions/nexus-identity'

/**
 * Kolejka ręcznego dopasowania kontraktorów do NEXUSA (Etap 2c).
 *
 * Automat linkuje wyłącznie przy jednoznacznym e-mailu, a 689 kontraktorów
 * COMPASSA ma dziś ZERO e-maili — więc to jest miejsce, w którym integracja
 * tożsamości realnie się domyka.
 *
 * `ambiguous` oznacza trafienie WIELOKROTNE. Automat nie wybiera świadomie:
 * sklejenie dwóch różnych osób jest ciche, trwałe i niesie dane osobowe.
 */
export function NexusIdentityQueue({ rows }: { rows: readonly NexusQueueRow[] }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)

    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Brak kontraktorów czekających na dopasowanie.
            </p>
        )
    }

    function run(action: () => Promise<{ success: boolean; error?: string }>) {
        setError(null)
        startTransition(async () => {
            const result = await action()
            // Komunikat dociera do użytkownika TYLKO jako dane — Next
            // w produkcji podmienia treść rzuconego wyjątku na komunikat
            // ogólny (patrz lib/actions/action-result.ts).
            if (!result.success) setError(result.error ?? 'Nie udało się zapisać.')
            else router.refresh()
        })
    }

    return (
        <div className="space-y-3">
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2">Kontraktor</th>
                        <th className="py-2">Klient</th>
                        <th className="py-2">Stan</th>
                        <th className="py-2">Id kontraktu w NEXUSIE</th>
                        <th className="py-2 sr-only">Akcje</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{row.fullName}</td>
                            <td className="py-2">{row.currentClient ?? ''}</td>
                            <td className="py-2">
                                {row.matchStatus === 'ambiguous'
                                    ? 'Wiele trafień'
                                    : 'Do sprawdzenia'}
                            </td>
                            <td className="py-2">
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    className="w-32 rounded border px-2 py-1"
                                    aria-label={`Id kontraktu w NEXUSIE dla ${row.fullName}`}
                                    value={drafts[row.id] ?? ''}
                                    onChange={(e) =>
                                        setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                                    }
                                />
                            </td>
                            <td className="py-2 text-right">
                                <button
                                    type="button"
                                    disabled={pending || !drafts[row.id]}
                                    className="mr-2 rounded border px-2 py-1 disabled:opacity-50"
                                    onClick={() =>
                                        run(() =>
                                            linkContractorToNexus({
                                                contractorId: row.id,
                                                nexusContractId: Number(drafts[row.id]),
                                            }),
                                        )
                                    }
                                >
                                    Powiąż
                                </button>
                                <button
                                    type="button"
                                    disabled={pending}
                                    className="rounded border px-2 py-1 disabled:opacity-50"
                                    onClick={() =>
                                        run(() => dismissNexusMatch({ contractorId: row.id }))
                                    }
                                >
                                    Nie ma w NEXUSIE
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
