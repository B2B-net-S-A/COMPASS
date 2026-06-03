'use client'

// Phase 28 — Placementy: admin/manager table with import, 168h-confirm and cancel.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, Ban, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { toast } from '@/lib/toast'
import {
    confirmPlacementHours,
    cancelPlacement,
    deletePlacementBonus,
} from '@/lib/actions/placements'
import {
    placementStatusLabelPl,
    type PlacementStatus,
    type PlacementWithBonusStatus,
} from '@/lib/types/placement'
import { PlacementImportDialog } from '@/components/internal/PlacementImportDialog'

interface Props {
    placements: PlacementWithBonusStatus[]
}

const FILTERS: Array<{ id: PlacementStatus | 'all'; label: string }> = [
    { id: 'all', label: 'Wszystkie' },
    { id: 'upcoming', label: 'Nadchodzące' },
    { id: 'started', label: 'Wystartowane' },
    { id: 'bonus_confirmed', label: 'Premia naliczona' },
    { id: 'cancelled', label: 'Anulowane' },
]

function pln(n: number | string): string {
    return `${Number(n).toLocaleString('pl-PL')} zł`
}

function statusVariant(s: PlacementStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (s === 'bonus_confirmed') return 'default'
    if (s === 'cancelled') return 'destructive'
    if (s === 'started') return 'secondary'
    return 'outline'
}

export function PlacementsAdminClient({ placements }: Props) {
    const router = useRouter()
    const [filter, setFilter] = useState<PlacementStatus | 'all'>('all')
    const [busyId, setBusyId] = useState<string | null>(null)
    const [, startTransition] = useTransition()
    const [confirm, ConfirmUI] = useConfirm()

    const visible = placements.filter((p) => filter === 'all' || p.status === filter)

    function refresh() {
        startTransition(() => router.refresh())
    }

    async function onConfirm(p: PlacementWithBonusStatus) {
        const ok = await confirm({
            description: `Potwierdzasz, że ${p.consultant_name} przepracował 168h?\n\nWygeneruje to premie:\n• DL (${p.delivery_lead_raw}): ${pln(p.dl_bonus_amount)}\n• Rekruter (${p.recruiter_raw}): ${pln(p.recruiter_bonus_amount)}`,
        })
        if (!ok) return
        setBusyId(p.id)
        try {
            await confirmPlacementHours(p.id)
            toast.success('Potwierdzono 168h — premie naliczone.')
            refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się potwierdzić.')
        } finally {
            setBusyId(null)
        }
    }

    async function onCancel(p: PlacementWithBonusStatus) {
        const reason = window.prompt(`Anulować placement ${p.consultant_name} @ ${p.client_name}?\nPodaj powód:`, '')
        if (reason === null) return
        setBusyId(p.id)
        try {
            await cancelPlacement(p.id, reason)
            toast.success('Placement anulowany.')
            refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się anulować.')
        } finally {
            setBusyId(null)
        }
    }

    async function onDeleteBonus(p: PlacementWithBonusStatus, kind: 'dl' | 'recruiter') {
        const who = kind === 'dl' ? p.delivery_lead_raw : p.recruiter_raw
        const label = kind === 'dl' ? 'DL' : 'rekrutera'
        const amount = kind === 'dl' ? p.dl_bonus_amount : p.recruiter_bonus_amount
        const status = kind === 'dl' ? p.dl_bonus_status : p.recruiter_bonus_status
        const willNotify = status !== 'cancelled'
        const notifyLine = willNotify
            ? '\nPracownik dostanie email + powiadomienie o anulowaniu.'
            : '\n(Premia jest już w statusie anulowanym — pracownik nie dostanie ponownego powiadomienia.)'
        const reason = window.prompt(
            `Usunąć bezpowrotnie premię ${label} (${who}, ${pln(amount)}) z placementu ${p.consultant_name} @ ${p.client_name}?\n\nPodaj powód (min. 3 znaki).${notifyLine}`,
            '',
        )
        if (reason === null) return
        if (reason.trim().length < 3) {
            toast.error('Powód usunięcia musi mieć co najmniej 3 znaki.')
            return
        }
        setBusyId(p.id)
        try {
            await deletePlacementBonus({
                placementId: p.id,
                bonusKind: kind,
                deletionReason: reason,
            })
            toast.success(`Premia ${label} usunięta.`)
            refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się usunąć premii.')
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1">
                    {FILTERS.map((f) => (
                        <Button
                            key={f.id}
                            size="sm"
                            variant={filter === f.id ? 'default' : 'ghost'}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline" className="gap-2">
                        <a href="/szablon-placementy-compass.xlsx" download="szablon-placementy-compass.xlsx">
                            <Download className="h-4 w-4" /> Pobierz szablon
                        </a>
                    </Button>
                    <PlacementImportDialog onImported={refresh} />
                </div>
            </div>

            {visible.length === 0 ? (
                <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Brak placementów{filter !== 'all' ? ' w tym filtrze' : ''}. Zaimportuj plik .xlsx, aby zacząć.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Konsultant</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">DL</th>
                                <th className="p-2 text-left">Rekruter</th>
                                <th className="p-2 text-left">Start</th>
                                <th className="p-2 text-left">168h ~</th>
                                <th className="p-2 text-right">Marża/h</th>
                                <th className="p-2 text-right">Premia DL</th>
                                <th className="p-2 text-right">Premia rekr.</th>
                                <th className="p-2 text-left">Status</th>
                                <th className="p-2 text-right">Akcje</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((p) => {
                                const actionable = p.status === 'upcoming' || p.status === 'started'
                                const isConfirmed = p.status === 'bonus_confirmed'
                                // Show "Usuń" whenever the link still points to a non-paid bonus.
                                // Includes assigned/pending (active) AND legacy cancelled rows so
                                // the manager can clean them up; deletion path silently skips
                                // notification for status='cancelled' (already notified earlier).
                                const dlDeletable =
                                    isConfirmed &&
                                    p.dl_bonus_status !== null &&
                                    p.dl_bonus_status !== 'paid'
                                const recDeletable =
                                    isConfirmed &&
                                    p.recruiter_bonus_status !== null &&
                                    p.recruiter_bonus_status !== 'paid'
                                return (
                                    <tr key={p.id} className="border-t align-middle">
                                        <td className="p-2 font-medium">{p.consultant_name}</td>
                                        <td className="p-2">{p.client_name}</td>
                                        <td className="p-2">{p.delivery_lead_raw}</td>
                                        <td className="p-2">{p.recruiter_raw}</td>
                                        <td className="p-2">{p.start_date}</td>
                                        <td className="p-2 text-muted-foreground">{p.bonus_eligible_date}</td>
                                        <td className="p-2 text-right">{Number(p.margin_per_hour)} zł/h</td>
                                        <td className="p-2 text-right">{pln(p.dl_bonus_amount)}</td>
                                        <td className="p-2 text-right">
                                            {pln(p.recruiter_bonus_amount)}{' '}
                                            <span className="text-muted-foreground">(t{p.recruiter_tier})</span>
                                        </td>
                                        <td className="p-2">
                                            <Badge variant={statusVariant(p.status)}>
                                                {placementStatusLabelPl(p.status)}
                                            </Badge>
                                        </td>
                                        <td className="p-2 text-right">
                                            {actionable ? (
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        disabled={busyId === p.id}
                                                        onClick={() => onConfirm(p)}
                                                        className="gap-1"
                                                    >
                                                        {busyId === p.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                        )}
                                                        168h
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busyId === p.id}
                                                        onClick={() => onCancel(p)}
                                                    >
                                                        <Ban className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ) : isConfirmed ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    {dlDeletable ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={busyId === p.id}
                                                            onClick={() => onDeleteBonus(p, 'dl')}
                                                            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                                                            title="Usuń bezpowrotnie premię Delivery Lead"
                                                        >
                                                            {busyId === p.id ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-3 w-3" />
                                                            )}
                                                            Usuń DL
                                                        </Button>
                                                    ) : null}
                                                    {recDeletable ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={busyId === p.id}
                                                            onClick={() => onDeleteBonus(p, 'recruiter')}
                                                            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                                                            title="Usuń bezpowrotnie premię rekrutera"
                                                        >
                                                            {busyId === p.id ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-3 w-3" />
                                                            )}
                                                            Usuń rekr.
                                                        </Button>
                                                    ) : null}
                                                    {!dlDeletable && !recDeletable ? (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <ConfirmUI />
        </div>
    )
}
