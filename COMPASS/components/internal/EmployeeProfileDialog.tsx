'use client'

// Phase 24c — HR profile dialog for admin/manager/finanse. Shows last 12 months
// of timesheets, invoices, and leaves of a selected employee in 3 tabs.

import { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import {
    getEmployeeProfile,
    type EmployeeHRSnapshot,
} from '@/lib/actions/internal-employee-profile'

interface Props {
    userId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onExportCSV: (userId: string, label: string) => void
}

const TS_STATUS: Record<string, { label: string; className: string }> = {
    draft: { label: 'Szkic', className: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
    submitted: {
        label: 'Oczekuje',
        className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    },
    approved: {
        label: 'Zaakceptowany',
        className: 'bg-green-500/15 text-green-300 border-green-500/30',
    },
    rejected: { label: 'Odrzucony', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
    submitted: {
        label: 'Złożona',
        className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    },
    manager_approved: {
        label: 'Manager OK',
        className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    },
    approved: {
        label: 'Zaakceptowana',
        className: 'bg-green-500/15 text-green-300 border-green-500/30',
    },
    rejected: { label: 'Odrzucona', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

const LEAVE_STATUS: Record<string, { label: string; className: string }> = {
    pending: {
        label: 'Oczekuje',
        className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    },
    approved: {
        label: 'Zaakceptowany',
        className: 'bg-green-500/15 text-green-300 border-green-500/30',
    },
    rejected: { label: 'Odrzucony', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
    cancelled: {
        label: 'Anulowany',
        className: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
    },
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'Zwolnienie L4',
    parental_leave: 'Urlop rodzicielski',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    other: 'Inne',
}

export function EmployeeProfileDialog({ userId, open, onOpenChange, onExportCSV }: Props) {
    const [snapshot, setSnapshot] = useState<EmployeeHRSnapshot | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open || !userId) {
            setSnapshot(null)
            return
        }
        let cancelled = false
        setLoading(true)
        getEmployeeProfile(userId, 12)
            .then((data) => {
                if (!cancelled) setSnapshot(data)
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    toast.error(err instanceof Error ? err.message : 'Błąd pobierania profilu')
                    onOpenChange(false)
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, userId, onOpenChange])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {snapshot
                            ? snapshot.profile.full_name ?? snapshot.profile.email
                            : 'Profil HR'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {snapshot ? (
                            <>
                                {snapshot.profile.email} · rola: {snapshot.profile.role}
                                {snapshot.profile.manager_full_name && (
                                    <> · manager: {snapshot.profile.manager_full_name}</>
                                )}
                                {snapshot.profile.hired_at && (
                                    <>
                                        {' '}
                                        · zatrudniony od{' '}
                                        {format(parseISO(snapshot.profile.hired_at), 'd LLL yyyy', {
                                            locale: pl,
                                        })}
                                    </>
                                )}
                            </>
                        ) : (
                            'Ładowanie...'
                        )}
                    </DialogDescription>
                </DialogHeader>

                {loading || !snapshot ? (
                    <div className="py-12 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <Tabs defaultValue="timesheets" className="flex-1 flex flex-col min-h-0">
                        <TabsList className="grid grid-cols-3">
                            <TabsTrigger value="timesheets">
                                Timesheety ({snapshot.timesheets.filter((t) => t.entry_count > 0).length})
                            </TabsTrigger>
                            <TabsTrigger value="invoices">
                                Faktury ({snapshot.invoices.length})
                            </TabsTrigger>
                            <TabsTrigger value="leaves">
                                Urlopy ({snapshot.leaves.length})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="timesheets" className="flex-1 min-h-0 mt-3">
                            <ScrollArea className="h-[60vh]">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-xs text-muted-foreground sticky top-0 bg-background">
                                            <th className="text-left py-2 pr-2 font-medium">Okres</th>
                                            <th className="text-left py-2 pr-2 font-medium">Status</th>
                                            <th className="text-right py-2 pr-2 font-medium">Wpisów</th>
                                            <th className="text-right py-2 pr-2 font-medium">Suma h</th>
                                            <th className="text-left py-2 pr-2 font-medium">Akceptacja</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {snapshot.timesheets.map((t) => {
                                            const status = TS_STATUS[t.status]
                                            return (
                                                <tr
                                                    key={`${t.year}-${t.month}`}
                                                    className="border-b border-border/40"
                                                >
                                                    <td className="py-2 pr-2 whitespace-nowrap">
                                                        {t.year}-{String(t.month).padStart(2, '0')}
                                                    </td>
                                                    <td className="py-2 pr-2">
                                                        {t.entry_count === 0 ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                brak
                                                            </span>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className={status?.className}
                                                            >
                                                                {status?.label ?? t.status}
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-2 text-right text-xs tabular-nums">
                                                        {t.entry_count}
                                                    </td>
                                                    <td className="py-2 pr-2 text-right font-mono text-xs tabular-nums">
                                                        {t.total_hours.toFixed(2)}
                                                    </td>
                                                    <td className="py-2 pr-2 text-xs">
                                                        {t.approved_at ? (
                                                            format(
                                                                parseISO(t.approved_at),
                                                                'd LLL yyyy',
                                                                { locale: pl },
                                                            )
                                                        ) : (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </ScrollArea>
                            <div className="pt-3 flex justify-end">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        onExportCSV(
                                            snapshot.profile.user_id,
                                            snapshot.profile.full_name ??
                                                snapshot.profile.email,
                                        )
                                    }
                                >
                                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                                    Eksport CSV (zakres miesięcy)
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="invoices" className="flex-1 min-h-0 mt-3">
                            <ScrollArea className="h-[60vh]">
                                {snapshot.invoices.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        Brak faktur w ciągu 12 miesięcy.
                                    </p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-xs text-muted-foreground sticky top-0 bg-background">
                                                <th className="text-left py-2 pr-2 font-medium">Okres</th>
                                                <th className="text-left py-2 pr-2 font-medium">Nr</th>
                                                <th className="text-right py-2 pr-2 font-medium">Kwota</th>
                                                <th className="text-left py-2 pr-2 font-medium">Status</th>
                                                <th className="text-left py-2 pr-2 font-medium">Akcja</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {snapshot.invoices.map((inv) => {
                                                const status = INVOICE_STATUS[inv.status]
                                                return (
                                                    <tr
                                                        key={inv.id}
                                                        className="border-b border-border/40"
                                                    >
                                                        <td className="py-2 pr-2 whitespace-nowrap">
                                                            {inv.period_year}-
                                                            {String(inv.period_month).padStart(
                                                                2,
                                                                '0',
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-2 text-xs font-mono">
                                                            {inv.invoice_number ?? '—'}
                                                        </td>
                                                        <td className="py-2 pr-2 text-right font-mono text-xs tabular-nums">
                                                            {Number(inv.amount).toFixed(2)}{' '}
                                                            {inv.currency}
                                                        </td>
                                                        <td className="py-2 pr-2">
                                                            <Badge
                                                                variant="outline"
                                                                className={status?.className}
                                                            >
                                                                {status?.label ?? inv.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-2 pr-2 text-xs">
                                                            {inv.reviewed_at ? (
                                                                format(
                                                                    parseISO(inv.reviewed_at),
                                                                    'd LLL',
                                                                    { locale: pl },
                                                                )
                                                            ) : inv.manager_reviewed_at ? (
                                                                format(
                                                                    parseISO(
                                                                        inv.manager_reviewed_at,
                                                                    ),
                                                                    'd LLL',
                                                                    { locale: pl },
                                                                )
                                                            ) : (
                                                                <span className="text-muted-foreground">
                                                                    —
                                                                </span>
                                                            )}
                                                            {inv.rejection_reason && (
                                                                <p className="text-[10px] text-red-300 mt-0.5">
                                                                    <AlertCircle className="inline h-3 w-3 mr-0.5" />
                                                                    {inv.rejection_reason.slice(0, 40)}
                                                                </p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="leaves" className="flex-1 min-h-0 mt-3">
                            <ScrollArea className="h-[60vh]">
                                {snapshot.leaves.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        Brak urlopów w ciągu 12 miesięcy.
                                    </p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-xs text-muted-foreground sticky top-0 bg-background">
                                                <th className="text-left py-2 pr-2 font-medium">Typ</th>
                                                <th className="text-left py-2 pr-2 font-medium">Od</th>
                                                <th className="text-left py-2 pr-2 font-medium">Do</th>
                                                <th className="text-left py-2 pr-2 font-medium">Status</th>
                                                <th className="text-left py-2 pr-2 font-medium">Decyzja</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {snapshot.leaves.map((l) => {
                                                const status = LEAVE_STATUS[l.status]
                                                return (
                                                    <tr
                                                        key={l.id}
                                                        className="border-b border-border/40"
                                                    >
                                                        <td className="py-2 pr-2 text-xs">
                                                            {LEAVE_TYPE_LABELS[l.leave_type] ??
                                                                l.leave_type}
                                                        </td>
                                                        <td className="py-2 pr-2 whitespace-nowrap text-xs">
                                                            {format(parseISO(l.start_date), 'd LLL', {
                                                                locale: pl,
                                                            })}
                                                        </td>
                                                        <td className="py-2 pr-2 whitespace-nowrap text-xs">
                                                            {format(parseISO(l.end_date), 'd LLL', {
                                                                locale: pl,
                                                            })}
                                                        </td>
                                                        <td className="py-2 pr-2">
                                                            <Badge
                                                                variant="outline"
                                                                className={status?.className}
                                                            >
                                                                {status?.label ?? l.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-2 pr-2 text-xs">
                                                            {l.decided_at
                                                                ? format(
                                                                      parseISO(l.decided_at),
                                                                      'd LLL',
                                                                      { locale: pl },
                                                                  )
                                                                : '—'}
                                                            {l.decision_note && (
                                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                                    {l.decision_note.slice(0, 60)}
                                                                </p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    )
}
