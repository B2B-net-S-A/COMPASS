'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    dismissNexusMatch,
    linkContractorToNexus,
    reopenNexusMatch,
    unlinkContractorFromNexus,
    type NexusQueueRow,
    type NexusQueueView,
} from '@/lib/actions/nexus-identity'
import type { NexusSuggestion } from '@/lib/contractors/nexus-match'

/**
 * Kolejka ręcznego dopasowania kontraktorów do NEXUSA.
 *
 * Przy każdym wierszu karty podpowiedzi z ostatniego eksportu NEXUSA (osoba,
 * klient, stanowisko, okres, status, e-mail) — operator rozstrzyga jednym
 * kliknięciem, bez szukania i przepisywania ID (audyt integracji 14.09, INT-06).
 * Ręczne pole ID zostaje jako fallback; serwer i tak weryfikuje numer w eksporcie.
 */

const CONTRACT_STATUS_PL: Record<string, string> = {
    active: 'aktywny',
    ending: 'kończy się',
    draft: 'szkic',
    ready_for_signature: 'do podpisu',
}

const REASON_PL: Record<string, string> = {
    duplicate_compass_email: 'Ten sam e-mail ma kilku kontraktorów w COMPASSIE',
    nexus_person_already_linked: 'Osoba z NEXUSA jest już powiązana z innym kontraktorem',
    nexus_person_linked_twice: 'Osoba z NEXUSA jest powiązana z kilkoma kontraktorami',
    multiple_nexus_people: 'Pasuje kilka osób w NEXUSIE',
}

type Mismatch = { contractorId: string; nexusContractId: number; nexusName: string; compassName: string }
type ActionOutcome = { success: boolean; error?: string }

function period(s: Pick<NexusSuggestion, 'startDate' | 'endDate'>): string {
    if (!s.startDate && !s.endDate) return 'okres nieznany'
    return `${s.startDate ?? '?'} – ${s.endDate ?? 'bezterminowo'}`
}

function SuggestionCard({
    suggestion,
    action,
}: {
    suggestion: NexusSuggestion
    action?: React.ReactNode
}) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-0.5 text-sm">
                <p className="font-medium">
                    {suggestion.fullName || '—'}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {suggestion.matchedBy === 'email' ? 'dopasowanie po e-mailu' : 'dopasowanie po nazwisku'}
                    </span>
                </p>
                <p className="text-muted-foreground">
                    {suggestion.clientName ?? 'klient nieznany'}
                    {suggestion.jobTitle && ` · ${suggestion.jobTitle}`}
                </p>
                <p className="text-muted-foreground">
                    {period(suggestion)} ·{' '}
                    {suggestion.status ? (CONTRACT_STATUS_PL[suggestion.status] ?? suggestion.status) : 'status nieznany'}
                    {suggestion.contractCount > 1 && ` · ${suggestion.contractCount} kontrakty w NEXUSIE`}
                </p>
                <p className="text-muted-foreground">
                    {suggestion.email ?? 'bez e-maila'} · kontrakt #{suggestion.nexusContractId}
                </p>
            </div>
            {action}
        </div>
    )
}

export function NexusIdentityQueue({
    view,
    rows,
}: {
    view: NexusQueueView
    rows: readonly NexusQueueRow[]
}) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [reasons, setReasons] = useState<Record<string, string>>({})
    const [dismissing, setDismissing] = useState<string | null>(null)
    const [unlinking, setUnlinking] = useState<string | null>(null)
    const [mismatch, setMismatch] = useState<Mismatch | null>(null)
    const [error, setError] = useState<string | null>(null)

    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground">Brak kontraktorów w tym widoku.</p>
    }

    function run(action: () => Promise<ActionOutcome>, after?: () => void) {
        setError(null)
        startTransition(async () => {
            const result = await action()
            // Komunikat dociera do użytkownika TYLKO jako dane — Next w produkcji
            // podmienia treść rzuconego wyjątku (lib/actions/action-result.ts).
            if (!result.success) {
                setError(result.error ?? 'Nie udało się zapisać.')
                return
            }
            after?.()
            router.refresh()
        })
    }

    function link(contractorId: string, nexusContractId: number, confirmNameMismatch = false) {
        setError(null)
        startTransition(async () => {
            const result = await linkContractorToNexus({ contractorId, nexusContractId, confirmNameMismatch })
            if (!result.success) {
                setError(result.error)
                return
            }
            if (result.data.status === 'name_mismatch') {
                setMismatch({
                    contractorId,
                    nexusContractId,
                    nexusName: result.data.nexusName,
                    compassName: result.data.compassName,
                })
                return
            }
            setMismatch(null)
            router.refresh()
        })
    }

    return (
        <div className="space-y-3">
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <ul className="space-y-3">
                {rows.map((row) => (
                    <li key={row.id} className="space-y-3 rounded-lg border p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                                <p className="font-medium">{row.fullName}</p>
                                <p className="text-sm text-muted-foreground">
                                    {row.currentClient ?? 'bez klienta w kartotece'}
                                    {row.matchStatus === 'ambiguous' && ' · wiele trafień'}
                                    {row.matchReason && REASON_PL[row.matchReason] && ` · ${REASON_PL[row.matchReason]}`}
                                </p>
                            </div>
                            {row.decidedAt && (
                                <p className="text-xs text-muted-foreground">
                                    Ostatnia decyzja: {row.decidedByName ?? 'nieznana osoba'}, {row.decidedAt.slice(0, 10)}
                                </p>
                            )}
                        </div>

                        {mismatch?.contractorId === row.id && (
                            <div role="alert" className="space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm">
                                <p>
                                    Nazwisko w NEXUSIE („{mismatch.nexusName}”) różni się od kartoteki („
                                    {mismatch.compassName}”). Powiąż tylko wtedy, gdy to na pewno ta sama osoba.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={pending}
                                        className="rounded border border-amber-600 px-2 py-1 disabled:opacity-50"
                                        onClick={() => link(row.id, mismatch.nexusContractId, true)}
                                    >
                                        Powiąż mimo różnicy
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded border px-2 py-1"
                                        onClick={() => setMismatch(null)}
                                    >
                                        Anuluj
                                    </button>
                                </div>
                            </div>
                        )}

                        {view === 'linked' && (
                            <>
                                {row.linked ? (
                                    <SuggestionCard suggestion={row.linked} />
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Powiązana osoba nie ma dziś kontraktu w eksporcie NEXUSA
                                        {row.nexusContractId ? ` (ostatni kontrakt #${row.nexusContractId})` : ''}.
                                    </p>
                                )}
                                {unlinking === row.id ? (
                                    <div className="flex flex-wrap gap-2">
                                        <input
                                            className="min-w-64 flex-1 rounded border px-2 py-1 text-sm"
                                            placeholder="Powód (opcjonalnie)"
                                            aria-label={`Powód odpięcia dla ${row.fullName}`}
                                            value={reasons[row.id] ?? ''}
                                            onChange={(e) => setReasons((r) => ({ ...r, [row.id]: e.target.value }))}
                                        />
                                        <button
                                            type="button"
                                            disabled={pending}
                                            className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                                            onClick={() =>
                                                run(
                                                    () =>
                                                        unlinkContractorFromNexus({
                                                            contractorId: row.id,
                                                            reason: reasons[row.id],
                                                        }),
                                                    () => setUnlinking(null),
                                                )
                                            }
                                        >
                                            Odepnij
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded border px-2 py-1 text-sm"
                                            onClick={() => setUnlinking(null)}
                                        >
                                            Anuluj
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className="rounded border px-2 py-1 text-sm"
                                        onClick={() => setUnlinking(row.id)}
                                    >
                                        Odepnij błędne powiązanie
                                    </button>
                                )}
                            </>
                        )}

                        {view === 'dismissed' && (
                            <>
                                <p className="text-sm">
                                    Powód: {row.matchReason ?? <span className="text-muted-foreground">brak</span>}
                                </p>
                                <button
                                    type="button"
                                    disabled={pending}
                                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                                    onClick={() => run(() => reopenNexusMatch({ contractorId: row.id }))}
                                >
                                    Przywróć do kolejki
                                </button>
                            </>
                        )}

                        {(view === 'open' || view === 'auto_not_found') && (
                            <>
                                {row.suggestions.length > 0 ? (
                                    <div className="space-y-2">
                                        {row.suggestions.map((s) => (
                                            <SuggestionCard
                                                key={s.nexusCandidateId}
                                                suggestion={s}
                                                action={
                                                    <button
                                                        type="button"
                                                        disabled={pending}
                                                        className="rounded border border-primary px-2 py-1 text-sm text-primary disabled:opacity-50"
                                                        onClick={() => link(row.id, s.nexusContractId)}
                                                    >
                                                        Powiąż z tą osobą
                                                    </button>
                                                }
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Brak podpowiedzi w ostatnim eksporcie NEXUSA.
                                    </p>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        className="w-40 rounded border px-2 py-1 text-sm"
                                        placeholder="Id kontraktu"
                                        aria-label={`Id kontraktu w NEXUSIE dla ${row.fullName}`}
                                        value={drafts[row.id] ?? ''}
                                        onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                                    />
                                    <button
                                        type="button"
                                        disabled={pending || !drafts[row.id]}
                                        className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                                        onClick={() => link(row.id, Number(drafts[row.id]))}
                                    >
                                        Powiąż po numerze
                                    </button>
                                    {dismissing === row.id ? (
                                        <>
                                            <input
                                                className="min-w-64 flex-1 rounded border px-2 py-1 text-sm"
                                                placeholder="Powód, np. kontraktor sprzed wdrożenia NEXUSA"
                                                aria-label={`Powód odrzucenia dla ${row.fullName}`}
                                                value={reasons[row.id] ?? ''}
                                                onChange={(e) =>
                                                    setReasons((r) => ({ ...r, [row.id]: e.target.value }))
                                                }
                                            />
                                            <button
                                                type="button"
                                                disabled={pending || (reasons[row.id] ?? '').trim().length < 3}
                                                className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                                                onClick={() =>
                                                    run(
                                                        () =>
                                                            dismissNexusMatch({
                                                                contractorId: row.id,
                                                                reason: reasons[row.id] ?? '',
                                                            }),
                                                        () => setDismissing(null),
                                                    )
                                                }
                                            >
                                                Zapisz odrzucenie
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded border px-2 py-1 text-sm"
                                                onClick={() => setDismissing(null)}
                                            >
                                                Anuluj
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={pending}
                                            className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                                            onClick={() => setDismissing(row.id)}
                                        >
                                            Nie ma w NEXUSIE
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}
