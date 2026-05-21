'use client'

// Phase 27c/27h — Finance/Admin "Stawki i Umowy" directory client.

import { useEffect, useMemo, useState } from 'react'
import { Coins, FileText, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { UserRateDirectoryRow } from '@/lib/types/rates'
import { EMPLOYMENT_TYPE_LABELS_PL } from '@/lib/types/rates'
import { ManageRateDialog } from './ManageRateDialog'
import { ManageContractDialog } from './ManageContractDialog'
import { RateHistoryDialog } from './RateHistoryDialog'

interface Props {
    initialDirectory: UserRateDirectoryRow[]
}

const ROLE_LABEL_PL: Record<string, string> = {
    admin: 'Admin',
    consultant: 'Konsultant IT',
    internal: 'Pracownik wewnętrzny',
    finanse: 'Finanse',
    manager: 'Manager',
    talent_community: 'Talent Community',
}

export function RatesDirectoryClient({ initialDirectory }: Props) {
    const [directory, setDirectory] = useState<UserRateDirectoryRow[]>(initialDirectory)
    const [rateTarget, setRateTarget] = useState<UserRateDirectoryRow | null>(null)
    const [contractTarget, setContractTarget] = useState<UserRateDirectoryRow | null>(null)
    const [historyTarget, setHistoryTarget] = useState<UserRateDirectoryRow | null>(null)
    const [filterRole, setFilterRole] = useState<string>('all')
    const [search, setSearch] = useState<string>('')

    // Re-sync when the server component refreshes (router.refresh after a mutation).
    useEffect(() => {
        setDirectory(initialDirectory)
    }, [initialDirectory])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return directory.filter((r) => {
            if (filterRole !== 'all' && r.role !== filterRole) return false
            if (q) {
                const hay = `${r.full_name ?? ''} ${r.email}`.toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
    }, [directory, filterRole, search])

    const withRate = filtered.filter((r) => r.current_rate != null).length
    const withoutRate = filtered.length - withRate
    const progressiveCount = filtered.filter((r) => r.is_progressive).length

    return (
        <div className="space-y-4">
            {/* Stats + filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Pracownicy ze stawką</div>
                    <div className="text-xl font-bold">{withRate}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Bez stawki</div>
                    <div className="text-xl font-bold text-amber-400">{withoutRate}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Progresywne</div>
                    <div className="text-xl font-bold">{progressiveCount}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Razem</div>
                    <div className="text-xl font-bold">{filtered.length}</div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="text"
                    placeholder="Szukaj pracownika…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 min-w-[200px] rounded-md border bg-background px-3 py-1.5 text-sm"
                />
                <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                    <option value="all">Wszystkie role</option>
                    {Object.entries(ROLE_LABEL_PL).map(([role, label]) => (
                        <option key={role} value={role}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="border-b border-border/40 text-xs text-muted-foreground sticky top-0 bg-background">
                        <tr>
                            <th className="text-left p-2 font-medium">Pracownik</th>
                            <th className="text-left p-2 font-medium">Rola</th>
                            <th className="text-left p-2 font-medium">Typ umowy</th>
                            <th className="text-right p-2 font-medium">Aktualna stawka</th>
                            <th className="text-left p-2 font-medium">Od kiedy</th>
                            <th className="text-left p-2 font-medium">Tryb</th>
                            <th className="text-right p-2 font-medium">Akcje</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((r) => (
                            <tr key={r.user_id} className="border-b border-border/20 last:border-0">
                                <td className="p-2">
                                    <div className="font-medium">{r.full_name ?? r.email}</div>
                                    <div className="text-xs text-muted-foreground">{r.email}</div>
                                </td>
                                <td className="p-2 text-xs">{ROLE_LABEL_PL[r.role] ?? r.role}</td>
                                <td className="p-2 text-xs">
                                    {r.employment_type ? (
                                        EMPLOYMENT_TYPE_LABELS_PL[r.employment_type]
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums">
                                    {r.current_rate != null ? (
                                        `${r.current_rate.toFixed(2)} ${r.current_currency}/h`
                                    ) : (
                                        <span className="text-amber-400 text-xs">brak</span>
                                    )}
                                </td>
                                <td className="p-2 text-xs">{r.current_effective_from ?? '—'}</td>
                                <td className="p-2 text-xs">
                                    {r.is_progressive ? (
                                        <div>
                                            <span className="inline-block rounded bg-sky-500/15 text-sky-300 px-1.5 py-0.5 text-[11px] font-medium">
                                                Progresywna
                                            </span>
                                            {r.next_scheduled_from && r.next_scheduled_rate != null && (
                                                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono tabular-nums">
                                                    → {r.next_scheduled_rate.toFixed(2)} od {r.next_scheduled_from}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground">Stała</span>
                                    )}
                                </td>
                                <td className="p-2 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setRateTarget(r)}
                                        >
                                            <Coins className="h-3 w-3 mr-1" />
                                            Stawka
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setContractTarget(r)}
                                        >
                                            <FileText className="h-3 w-3 mr-1" />
                                            Umowa
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setHistoryTarget(r)}
                                        >
                                            <History className="h-3 w-3 mr-1" />
                                            Historia
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                                    Brak pracowników spełniających kryteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {rateTarget && (
                <ManageRateDialog
                    target={rateTarget}
                    employees={directory}
                    onOpenChange={(open) => !open && setRateTarget(null)}
                />
            )}
            {contractTarget && (
                <ManageContractDialog
                    target={contractTarget}
                    onOpenChange={(open) => !open && setContractTarget(null)}
                />
            )}
            {historyTarget && (
                <RateHistoryDialog
                    userId={historyTarget.user_id}
                    userName={historyTarget.full_name ?? historyTarget.email}
                    onOpenChange={(open) => !open && setHistoryTarget(null)}
                />
            )}
        </div>
    )
}
