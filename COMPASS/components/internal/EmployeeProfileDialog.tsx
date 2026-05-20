'use client'

// Phase 24c — HR profile dialog for admin/manager/finanse. Shows last 12 months
// of timesheets, invoices, leaves, and bonuses (Phase 26) of a selected employee.

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
import { Loader2, FileSpreadsheet, AlertCircle, Gift, Clock, Wallet } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import {
    getEmployeeProfile,
    type EmployeeHRSnapshot,
} from '@/lib/actions/internal-employee-profile'
import { getPayrollSummaryForUser } from '@/lib/actions/internal-payroll'
import type { PayrollSummary } from '@/lib/types/rates'
import { isInvoicesEnabled } from '@/lib/feature-flags'
import { AssignBonusForm } from './AssignBonusForm'
import { OvertimeOverrideDialog } from './OvertimeOverrideDialog'
import { BONUS_MONTHS_PL, BONUS_CATEGORIES_PL } from '@/lib/types/bonus'
import type { EligibleEmployeeForBonus } from '@/lib/types/bonus'

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

const BONUS_STATUS: Record<string, { label: string; className: string }> = {
    assigned: {
        label: 'Przypisana',
        className: 'bg-green-500/15 text-green-300 border-green-500/30',
    },
    paid: {
        label: 'Wypłacona (legacy)',
        className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    },
    pending: {
        label: 'Oczekuje (legacy)',
        className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    },
    cancelled: {
        label: 'Anulowana',
        className: 'bg-red-500/15 text-red-300 border-red-500/30',
    },
}

function bonusPeriodLabel(year: number | null, month: number | null): string {
    if (!year || !month) return '—'
    return `${BONUS_MONTHS_PL[month - 1]} ${year}`
}

export function EmployeeProfileDialog({ userId, open, onOpenChange, onExportCSV }: Props) {
    const [snapshot, setSnapshot] = useState<EmployeeHRSnapshot | null>(null)
    const [loading, setLoading] = useState(false)
    const [assignOpen, setAssignOpen] = useState(false)
    // Phase 27a — overtime override dialog state
    const [overtimeTarget, setOvertimeTarget] = useState<{ year: number; month: number } | null>(null)
    // Phase 27c — payroll tab state (lazy loaded)
    const now = new Date()
    const [payrollYear, setPayrollYear] = useState<number>(now.getFullYear())
    const [payrollMonth, setPayrollMonth] = useState<number>(now.getMonth() + 1)
    const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null)
    const [payrollLoading, setPayrollLoading] = useState<boolean>(false)

    const invoicesUiOn = isInvoicesEnabled()

    const reload = () => {
        if (!userId) return
        setLoading(true)
        getEmployeeProfile(userId, 12)
            .then((data) => setSnapshot(data))
            .catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : 'Błąd pobierania profilu')
                onOpenChange(false)
            })
            .finally(() => setLoading(false))
    }

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

    const lockedRecipient: EligibleEmployeeForBonus | null = snapshot
        ? {
              user_id: snapshot.profile.user_id,
              full_name: snapshot.profile.full_name,
              email: snapshot.profile.email,
              role: snapshot.profile.role,
          }
        : null

    return (
        <>
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
                    <>
                        {/* Top-level actions (Phase 26 — Assign bonus button for manager/admin). */}
                        {snapshot.viewer_can_assign_bonus && (
                            <div className="flex justify-end gap-2 -mt-1 mb-2">
                                <Button
                                    size="sm"
                                    onClick={() => setAssignOpen(true)}
                                >
                                    <Gift className="h-3.5 w-3.5 mr-1.5" />
                                    Przypisz premię
                                </Button>
                            </div>
                        )}
                        <Tabs
                            defaultValue="timesheets"
                            className="flex-1 flex flex-col min-h-0"
                            onValueChange={(value) => {
                                // Phase 27c — lazy load payroll when tab activates.
                                if (value === 'payroll' && !payrollLoading && (!payrollSummary || payrollSummary.year !== payrollYear || payrollSummary.month !== payrollMonth)) {
                                    setPayrollLoading(true)
                                    getPayrollSummaryForUser(snapshot.profile.user_id, payrollYear, payrollMonth)
                                        .then((s) => setPayrollSummary(s))
                                        .catch((err) => toast.error(err instanceof Error ? err.message : 'Błąd payroll'))
                                        .finally(() => setPayrollLoading(false))
                                }
                            }}
                        >
                        <TabsList
                            className={
                                invoicesUiOn ? 'grid grid-cols-5' : 'grid grid-cols-4'
                            }
                        >
                            <TabsTrigger value="timesheets">
                                Timesheety ({snapshot.timesheets.filter((t) => t.entry_count > 0).length})
                            </TabsTrigger>
                            {invoicesUiOn && (
                                <TabsTrigger value="invoices">
                                    Faktury ({snapshot.invoices.length})
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="leaves">
                                Urlopy ({snapshot.leaves.length})
                            </TabsTrigger>
                            <TabsTrigger value="bonuses">
                                Premie ({snapshot.bonuses.length})
                            </TabsTrigger>
                            <TabsTrigger value="payroll">
                                Payroll
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
                                            {snapshot.viewer_is_admin && (
                                                <th className="text-right py-2 pr-2 font-medium">Akcje</th>
                                            )}
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
                                                    {snapshot.viewer_is_admin && (
                                                        <td className="py-2 pr-2 text-right">
                                                            {t.entry_count > 0 && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-7 px-2 text-[11px]"
                                                                    onClick={() =>
                                                                        setOvertimeTarget({
                                                                            year: t.year,
                                                                            month: t.month,
                                                                        })
                                                                    }
                                                                >
                                                                    <Clock className="h-3 w-3 mr-1" />
                                                                    Nadgodziny
                                                                </Button>
                                                            )}
                                                        </td>
                                                    )}
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

                        {invoicesUiOn && (
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
                        )}

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

                        {/* Phase 27c — Payroll tab (lazy load on activate). */}
                        <TabsContent value="payroll" className="flex-1 min-h-0 mt-3">
                            <ScrollArea className="h-[60vh]">
                                <div className="space-y-3">
                                    {/* Period picker */}
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium">Miesiąc:</label>
                                        <select
                                            value={`${payrollYear}-${payrollMonth}`}
                                            onChange={(e) => {
                                                const [y, m] = e.target.value.split('-').map(Number)
                                                setPayrollYear(y)
                                                setPayrollMonth(m)
                                                setPayrollSummary(null)
                                                setPayrollLoading(true)
                                                getPayrollSummaryForUser(snapshot.profile.user_id, y, m)
                                                    .then((s) => setPayrollSummary(s))
                                                    .catch((err) => toast.error(err instanceof Error ? err.message : 'Błąd payroll'))
                                                    .finally(() => setPayrollLoading(false))
                                            }}
                                            className="rounded-md border bg-background px-2 py-1 text-xs"
                                        >
                                            {Array.from({ length: 12 }).map((_, i) => {
                                                const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
                                                const y = d.getFullYear()
                                                const m = d.getMonth() + 1
                                                return (
                                                    <option key={`${y}-${m}`} value={`${y}-${m}`}>
                                                        {BONUS_MONTHS_PL[m - 1]} {y}
                                                    </option>
                                                )
                                            })}
                                        </select>
                                    </div>

                                    {payrollLoading ? (
                                        <div className="py-8 flex items-center justify-center">
                                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : !payrollSummary ? (
                                        <p className="text-sm text-muted-foreground text-center py-6">
                                            Wybierz miesiąc, aby załadować rozliczenie.
                                        </p>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="rounded-md border border-white/10 bg-white/5 p-2">
                                                    <div className="text-[10px] text-muted-foreground">Godziny</div>
                                                    <div className="text-lg font-bold">{payrollSummary.hours_total.toFixed(2)} h</div>
                                                </div>
                                                <div className="rounded-md border border-white/10 bg-white/5 p-2">
                                                    <div className="text-[10px] text-muted-foreground">Stawka</div>
                                                    <div className="text-lg font-bold">
                                                        {payrollSummary.rate != null
                                                            ? `${payrollSummary.rate.toFixed(2)} ${payrollSummary.rate_currency}/h`
                                                            : '—'}
                                                    </div>
                                                </div>
                                                <div className="rounded-md border border-white/10 bg-white/5 p-2">
                                                    <div className="text-[10px] text-muted-foreground">Podstawowa</div>
                                                    <div className="text-lg font-bold">
                                                        {payrollSummary.base_amount != null
                                                            ? `${payrollSummary.base_amount.toFixed(2)} ${payrollSummary.rate_currency}`
                                                            : '—'}
                                                    </div>
                                                </div>
                                            </div>
                                            {payrollSummary.bonuses.length > 0 && (
                                                <table className="w-full text-xs">
                                                    <thead className="border-b border-border/40 text-muted-foreground">
                                                        <tr>
                                                            <th className="text-left py-1.5 font-medium">Kategoria</th>
                                                            <th className="text-right py-1.5 font-medium">Kwota</th>
                                                            <th className="text-left py-1.5 font-medium">Powód</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {payrollSummary.bonuses.map((b) => (
                                                            <tr key={b.id} className="border-b border-border/20">
                                                                <td className="py-1.5">{BONUS_CATEGORIES_PL[b.category]}</td>
                                                                <td className="py-1.5 text-right font-mono tabular-nums">
                                                                    {b.amount.toFixed(2)} {b.currency}
                                                                </td>
                                                                <td className="py-1.5 text-muted-foreground">{b.reason}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                            <div className="rounded-md border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">Suma całkowita</span>
                                                <span className="text-xl font-bold">
                                                    {payrollSummary.grand_total != null
                                                        ? `${payrollSummary.grand_total.toFixed(2)} ${payrollSummary.rate_currency}`
                                                        : (
                                                              <span className="text-amber-400 text-sm">mieszane waluty</span>
                                                          )}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        {/* Phase 26 — Bonuses tab (read-only). */}
                        <TabsContent value="bonuses" className="flex-1 min-h-0 mt-3">
                            <ScrollArea className="h-[60vh]">
                                {snapshot.bonuses.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        Brak premii w ciągu 12 miesięcy.
                                    </p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-xs text-muted-foreground sticky top-0 bg-background">
                                                <th className="text-left py-2 pr-2 font-medium">Miesiąc</th>
                                                <th className="text-right py-2 pr-2 font-medium">Kwota</th>
                                                <th className="text-left py-2 pr-2 font-medium">Status</th>
                                                <th className="text-left py-2 pr-2 font-medium">Uzasadnienie</th>
                                                <th className="text-left py-2 pr-2 font-medium">Manager</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {snapshot.bonuses.map((b) => {
                                                const status = BONUS_STATUS[b.status]
                                                return (
                                                    <tr key={b.id} className="border-b border-border/40">
                                                        <td className="py-2 pr-2 whitespace-nowrap text-xs">
                                                            {bonusPeriodLabel(b.period_year, b.period_month)}
                                                        </td>
                                                        <td className="py-2 pr-2 text-right font-mono text-xs tabular-nums">
                                                            {b.amount.toFixed(2)} {b.currency}
                                                        </td>
                                                        <td className="py-2 pr-2">
                                                            <Badge
                                                                variant="outline"
                                                                className={status?.className}
                                                            >
                                                                {status?.label ?? b.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-2 pr-2 text-xs max-w-[280px]">
                                                            {b.reason}
                                                            {b.cancellation_reason && (
                                                                <p className="text-[10px] text-red-300 mt-0.5">
                                                                    Anul.: {b.cancellation_reason.slice(0, 60)}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-2 text-xs">
                                                            {b.proposer_full_name ?? '—'}
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
                    </>
                )}
            </DialogContent>
        </Dialog>

        {/* Phase 26 — Assign Bonus dialog (sibling, separate portal). */}
        {assignOpen && lockedRecipient && (
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Przypisz premię</DialogTitle>
                        <DialogDescription>
                            {lockedRecipient.full_name ?? lockedRecipient.email}. Pracownik dostanie email + push.
                        </DialogDescription>
                    </DialogHeader>
                    <AssignBonusForm
                        mode="assign"
                        candidates={[lockedRecipient]}
                        prefilledRecipientId={lockedRecipient.user_id}
                        compact
                        onSuccess={() => {
                            setAssignOpen(false)
                            reload()
                        }}
                        onCancel={() => setAssignOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        )}

        {/* Phase 27a — Overtime override dialog (admin only). */}
        {overtimeTarget && snapshot && (
            <OvertimeOverrideDialog
                open={!!overtimeTarget}
                onOpenChange={(o) => !o && setOvertimeTarget(null)}
                userId={snapshot.profile.user_id}
                employeeName={snapshot.profile.full_name ?? snapshot.profile.email}
                year={overtimeTarget.year}
                month={overtimeTarget.month}
                onSuccess={() => reload()}
            />
        )}
        </>
    )
}
