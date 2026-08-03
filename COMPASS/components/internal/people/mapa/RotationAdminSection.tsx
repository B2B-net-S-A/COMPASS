'use client'

// Phase 46 (Etap 2) — przydziały bloków na bieżący kwartał.
// Widok dla TCM (kto ma jaki blok, kto już rozmawiał); zmiana bloku i przeliczenie
// tylko dla admina. „Przelicz" woła tę samą ścieżkę co cron — materializuje
// brakujące przydziały, nie ruszając ręcznych.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { overrideBlockAssignment, recalcBlockAssignments } from '@/lib/actions/tech-map'
import type { RotationOverview } from '@/lib/actions/tech-map'
import { INTERVIEW_BLOCK_PL, INTERVIEW_BLOCKS, type InterviewBlock } from '@/lib/types/tech-map'

const selectCls = 'flex h-8 rounded-md border border-input bg-background px-2 py-0.5 text-xs'

export function RotationAdminSection({
    overview,
    isAdmin,
}: {
    overview: RotationOverview
    isAdmin: boolean
}) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [busy, setBusy] = useState<string | null>(null)
    const [onlyPending, setOnlyPending] = useState(false)

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return overview.rows.filter((r) => {
            if (onlyPending && r.cardThisQuarter) return false
            if (!q) return true
            return (
                r.contractorName.toLowerCase().includes(q) ||
                (r.currentClient ?? '').toLowerCase().includes(q)
            )
        })
    }, [overview.rows, search, onlyPending])

    const done = overview.rows.filter((r) => r.cardThisQuarter).length

    async function recalc() {
        setBusy('recalc')
        try {
            const stats = await recalcBlockAssignments()
            toast.success(
                `Przeliczono ${stats.period}: nadano ${stats.assigned}, pominięto ${stats.skipped}.`,
            )
            router.refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się przeliczyć.')
        } finally {
            setBusy(null)
        }
    }

    async function override(contractorId: string, block: InterviewBlock) {
        setBusy(contractorId)
        try {
            await overrideBlockAssignment({ contractorId, block })
            toast.success('Zmieniono przydział.')
            router.refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się zmienić.')
        } finally {
            setBusy(null)
        }
    }

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold">
                        Przydziały bloków — {overview.year} Q{overview.quarter}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Rozmowy w tym kwartale: {done}/{overview.rows.length}
                        {overview.unassigned > 0 &&
                            ` · ${overview.unassigned} bez zapisanego przydziału (blok wyliczony z cyklu)`}
                    </p>
                </div>
                {isAdmin && (
                    <Button variant="outline" onClick={recalc} disabled={busy !== null}>
                        {busy === 'recalc' ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Przelicz przydziały
                    </Button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="w-56"
                    placeholder="Szukaj konsultanta lub klienta…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={onlyPending}
                        onChange={(e) => setOnlyPending(e.target.checked)}
                    />
                    Tylko bez rozmowy w tym kwartale
                </label>
                <span className="ml-auto text-xs text-muted-foreground">
                    {rows.length} / {overview.rows.length}
                </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Konsultant</th>
                            <th className="px-3 py-2 font-medium">Klient</th>
                            <th className="px-3 py-2 font-medium">Blok</th>
                            <th className="px-3 py-2 font-medium">Rozmowa w kwartale</th>
                            {isAdmin && <th className="px-3 py-2 font-medium">Zmień</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rows.map((r) => (
                            <tr key={r.contractorId} className="hover:bg-muted/40">
                                <td className="px-3 py-2">{r.contractorName}</td>
                                <td className="px-3 py-2 text-muted-foreground">{r.currentClient ?? '—'}</td>
                                <td className="px-3 py-2">
                                    <span className="font-semibold">{r.block}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                        {INTERVIEW_BLOCK_PL[r.block]}
                                    </span>
                                    {r.source === 'manual' && (
                                        <Badge variant="warning" size="sm" className="ml-2">
                                            ręczny
                                        </Badge>
                                    )}
                                    {r.basis === 'computed' && (
                                        <Badge variant="neutral" size="sm" className="ml-2">
                                            z cyklu
                                        </Badge>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    {r.cardThisQuarter ? (
                                        <span className="text-xs tabular-nums">{r.cardThisQuarter}</span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">— brak</span>
                                    )}
                                </td>
                                {isAdmin && (
                                    <td className="px-3 py-2">
                                        <select
                                            className={selectCls}
                                            value={r.block}
                                            disabled={busy !== null}
                                            onChange={(e) =>
                                                void override(r.contractorId, e.target.value as InterviewBlock)
                                            }
                                        >
                                            {INTERVIEW_BLOCKS.map((b) => (
                                                <option key={b} value={b}>
                                                    {b}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr>
                                <td
                                    colSpan={isAdmin ? 5 : 4}
                                    className="px-3 py-8 text-center text-muted-foreground"
                                >
                                    {overview.rows.length === 0
                                        ? 'Brak aktywnych konsultantów.'
                                        : 'Brak wyników dla filtrów.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
