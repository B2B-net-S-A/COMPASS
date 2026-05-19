'use client'

// Phase 27c — Payroll client: 3 tabs (mine/team/all) + period picker + summary tables.

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Download, AlertCircle } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
    getMyPayrollSummary,
    getPayrollSummaryForManager,
    getPayrollSummaryAll,
    exportPayrollCsv,
} from '@/lib/actions/internal-payroll'
import type { PayrollSummary } from '@/lib/types/rates'
import { BONUS_CATEGORIES_PL, BONUS_MONTHS_PL } from '@/lib/types/bonus'

interface Props {
    initialTab: 'mine' | 'team' | 'all'
    initialYear: number
    initialMonth: number
    isManager: boolean
    isAdminOrFinanse: boolean
    currentUserId: string
}

function buildMonthOptions(): Array<{ year: number; month: number; label: string }> {
    const now = new Date()
    const opts: Array<{ year: number; month: number; label: string }> = []
    for (let i = 0; i < 24; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const year = d.getFullYear()
        const month = d.getMonth() + 1
        opts.push({
            year,
            month,
            label: `${BONUS_MONTHS_PL[month - 1]} ${year}`,
        })
    }
    return opts
}

function formatMoney(value: number | null, currency: string | null | undefined): string {
    if (value == null || !currency) return '—'
    return `${value.toFixed(2)} ${currency}`
}

export function PayrollClient({
    initialTab,
    initialYear,
    initialMonth,
    isManager,
    isAdminOrFinanse,
    currentUserId,
}: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [tab, setTab] = useState<'mine' | 'team' | 'all'>(initialTab)
    const [year, setYear] = useState<number>(initialYear)
    const [month, setMonth] = useState<number>(initialMonth)
    const [loading, setLoading] = useState<boolean>(false)
    const [mineSummary, setMineSummary] = useState<PayrollSummary | null>(null)
    const [teamSummaries, setTeamSummaries] = useState<PayrollSummary[] | null>(null)
    const [allSummaries, setAllSummaries] = useState<PayrollSummary[] | null>(null)
    const [exporting, setExporting] = useState<boolean>(false)

    const monthOptions = useMemo(() => buildMonthOptions(), [])

    // Update URL when filters change (without full reload).
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', tab)
        params.set('year', String(year))
        params.set('month', String(month))
        router.replace(`/internal/payroll?${params.toString()}`, { scroll: false })
    }, [tab, year, month])

    // Fetch summaries when tab/period changes.
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        ;(async () => {
            try {
                if (tab === 'mine') {
                    const s = await getMyPayrollSummary(year, month)
                    if (!cancelled) setMineSummary(s)
                } else if (tab === 'team') {
                    const s = await getPayrollSummaryForManager(year, month)
                    if (!cancelled) setTeamSummaries(s)
                } else if (tab === 'all') {
                    const s = await getPayrollSummaryAll(year, month)
                    if (!cancelled) setAllSummaries(s)
                }
            } catch (err) {
                if (!cancelled) toast.error(err instanceof Error ? err.message : 'Błąd pobierania rozliczenia')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [tab, year, month])

    async function handleExport(scope: 'team' | 'all') {
        setExporting(true)
        try {
            const result = await exportPayrollCsv(year, month, scope)
            const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = result.filename
            a.click()
            URL.revokeObjectURL(url)
            toast.success(`Wyeksportowano ${result.row_count} wierszy.`)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Błąd eksportu')
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
                <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
                    Moje
                </TabButton>
                {(isManager || isAdminOrFinanse) && (
                    <TabButton active={tab === 'team'} onClick={() => setTab('team')}>
                        Mój zespół
                    </TabButton>
                )}
                {isAdminOrFinanse && (
                    <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
                        Wszyscy
                    </TabButton>
                )}
            </div>

            {/* Period picker + actions */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Miesiąc:</label>
                    <select
                        value={`${year}-${month}`}
                        onChange={(e) => {
                            const [y, m] = e.target.value.split('-').map(Number)
                            setYear(y)
                            setMonth(m)
                        }}
                        className="rounded-md border bg-background px-3 py-1.5 text-sm"
                    >
                        {monthOptions.map((o) => (
                            <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
                {(tab === 'team' || tab === 'all') && isAdminOrFinanse && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExport(tab === 'team' ? 'team' : 'all')}
                        disabled={exporting || loading}
                    >
                        {exporting ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-1.5" />
                        )}
                        Eksport CSV
                    </Button>
                )}
            </div>

            {/* Content */}
            {loading ? (
                <div className="py-12 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : tab === 'mine' && mineSummary ? (
                <MineSummaryView summary={mineSummary} />
            ) : tab === 'team' && teamSummaries ? (
                <SummaryTable summaries={teamSummaries} emptyText="Brak pracowników w Twoim zespole." />
            ) : tab === 'all' && allSummaries ? (
                <SummaryTable summaries={allSummaries} emptyText="Brak danych dla wybranego miesiąca." />
            ) : null}
        </div>
    )
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
        >
            {children}
        </button>
    )
}

function MineSummaryView({ summary }: { summary: PayrollSummary }) {
    const hasRate = summary.rate != null
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiCard label="Godziny" value={`${summary.hours_total.toFixed(2)} h`} />
                <KpiCard
                    label="Stawka"
                    value={hasRate ? formatMoney(summary.rate, summary.rate_currency) + '/h' : '—'}
                    sub={hasRate ? 'aktywna w tym miesiącu' : 'finanse jeszcze nie ustawili'}
                />
                <KpiCard
                    label="Kwota podstawowa"
                    value={formatMoney(summary.base_amount, summary.rate_currency)}
                />
            </div>

            <BonusTable bonuses={summary.bonuses} />

            <div className="rounded-lg border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Suma całkowita</span>
                <span className="text-2xl font-bold">
                    {summary.grand_total != null
                        ? formatMoney(summary.grand_total, summary.rate_currency)
                        : (
                              <span className="text-amber-400 flex items-center gap-1 text-base">
                                  <AlertCircle className="h-4 w-4" />
                                  Mieszane waluty — patrz tabela
                              </span>
                          )}
                </span>
            </div>

            {summary.timesheet_status !== 'approved' && (
                <p className="text-xs text-amber-400">
                    Status timesheet: {summary.timesheet_status}. Kwota podstawowa zostanie sfinalizowana po akceptacji.
                </p>
            )}
        </div>
    )
}

function BonusTable({ bonuses }: { bonuses: PayrollSummary['bonuses'] }) {
    if (bonuses.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-center text-sm text-muted-foreground">
                Brak premii w tym miesiącu.
            </div>
        )
    }
    return (
        <div className="rounded-lg border border-white/10">
            <table className="w-full text-sm">
                <thead className="border-b border-border/40 text-xs text-muted-foreground">
                    <tr>
                        <th className="text-left p-2 font-medium">Kategoria</th>
                        <th className="text-right p-2 font-medium">Kwota</th>
                        <th className="text-left p-2 font-medium">Powód</th>
                    </tr>
                </thead>
                <tbody>
                    {bonuses.map((b) => (
                        <tr key={b.id} className="border-b border-border/20 last:border-0">
                            <td className="p-2">{BONUS_CATEGORIES_PL[b.category]}</td>
                            <td className="p-2 text-right font-mono tabular-nums">
                                {b.amount.toFixed(2)} {b.currency}
                            </td>
                            <td className="p-2 text-muted-foreground max-w-[420px]">{b.reason}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function SummaryTable({ summaries, emptyText }: { summaries: PayrollSummary[]; emptyText: string }) {
    if (summaries.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-8 text-center text-muted-foreground">
                {emptyText}
            </div>
        )
    }
    return (
        <div className="rounded-lg border border-white/10 overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="border-b border-border/40 text-xs text-muted-foreground sticky top-0 bg-background">
                    <tr>
                        <th className="text-left p-2 font-medium">Pracownik</th>
                        <th className="text-left p-2 font-medium">Rola</th>
                        <th className="text-right p-2 font-medium">Godziny</th>
                        <th className="text-right p-2 font-medium">Stawka</th>
                        <th className="text-right p-2 font-medium">Podstawowa</th>
                        <th className="text-right p-2 font-medium">Premie</th>
                        <th className="text-right p-2 font-medium">Suma</th>
                        <th className="text-left p-2 font-medium">Timesheet</th>
                    </tr>
                </thead>
                <tbody>
                    {summaries.map((s) => {
                        const bonusBreakdown = Object.entries(s.bonus_totals_by_currency)
                            .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
                            .join(', ')
                        return (
                            <tr key={s.user_id} className="border-b border-border/20 last:border-0">
                                <td className="p-2">
                                    <div className="font-medium">{s.full_name ?? s.email}</div>
                                    <div className="text-xs text-muted-foreground">{s.email}</div>
                                </td>
                                <td className="p-2 text-xs">{s.role}</td>
                                <td className="p-2 text-right font-mono tabular-nums">
                                    {s.hours_total.toFixed(2)}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums">
                                    {s.rate != null
                                        ? `${s.rate.toFixed(2)} ${s.rate_currency}/h`
                                        : '—'}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums">
                                    {formatMoney(s.base_amount, s.rate_currency)}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums text-xs">
                                    {bonusBreakdown || '—'}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums font-semibold">
                                    {s.grand_total != null
                                        ? formatMoney(s.grand_total, s.rate_currency)
                                        : (
                                              <span className="text-amber-400 text-[11px]">mieszane</span>
                                          )}
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">{s.timesheet_status}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
            {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
        </div>
    )
}
