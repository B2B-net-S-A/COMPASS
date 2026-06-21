'use client'

// Phase 27c — Finance/Admin rates directory client.

import { useMemo, useState } from 'react'
import { Loader2, Pencil, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import type { UserRateDirectoryRow } from '@/lib/types/rates'
import { ChangeRateDialog } from './ChangeRateDialog'
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
    const [editTarget, setEditTarget] = useState<UserRateDirectoryRow | null>(null)
    const [historyTarget, setHistoryTarget] = useState<UserRateDirectoryRow | null>(null)
    const [filterRole, setFilterRole] = useState<string>('all')
    const [search, setSearch] = useState<string>('')

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

    function handleRateSet(targetUserId: string, newRate: number, currency: string, effectiveFrom: string) {
        setDirectory((prev) =>
            prev.map((r) =>
                r.user_id === targetUserId
                    ? {
                          ...r,
                          current_rate: newRate,
                          current_currency: currency as UserRateDirectoryRow['current_currency'],
                          current_effective_from: effectiveFrom,
                      }
                    : r,
            ),
        )
        setEditTarget(null)
    }

    return (
        <div className="space-y-4">
            {/* Stats + filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Pracownicy z stawką</div>
                    <div className="text-xl font-bold">{withRate}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Bez stawki</div>
                    <div className="text-xl font-bold text-warning">{withoutRate}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
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
            <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="border-b border-border/40 text-xs text-muted-foreground sticky top-0 bg-background">
                        <tr>
                            <th className="text-left p-2 font-medium">Pracownik</th>
                            <th className="text-left p-2 font-medium">Rola</th>
                            <th className="text-left p-2 font-medium">Manager</th>
                            <th className="text-right p-2 font-medium">Aktualna stawka</th>
                            <th className="text-left p-2 font-medium">Od kiedy</th>
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
                                <td className="p-2 text-xs text-muted-foreground">
                                    {r.manager_full_name ?? '—'}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums">
                                    {r.current_rate != null ? (
                                        `${r.current_rate.toFixed(2)} ${r.current_currency}/h`
                                    ) : (
                                        <span className="text-warning text-xs">brak</span>
                                    )}
                                </td>
                                <td className="p-2 text-xs">
                                    {r.current_effective_from ?? '—'}
                                </td>
                                <td className="p-2 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setEditTarget(r)}
                                        >
                                            <Pencil className="h-3 w-3 mr-1" />
                                            Zmień
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
                                <td colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                                    Brak pracowników spełniających kryteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {editTarget && (
                <ChangeRateDialog
                    target={editTarget}
                    onOpenChange={(open) => !open && setEditTarget(null)}
                    onSuccess={handleRateSet}
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
