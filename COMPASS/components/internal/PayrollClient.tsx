'use client'

// Phase 27c — Payroll client: 3 tabs (mine/team/all) + period picker + summary tables.
// Phase 32 — per-person timesheet PDF download, person search, "ready for payout"
//            filter (approved + assigned, locked from the manager), and full bonus
//            detail ("za co") expandable per row so finanse sees the whole picture.

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    Loader2,
    Download,
    AlertCircle,
    FileDown,
    Lock,
    Search,
    ChevronDown,
    ChevronRight,
    CheckCircle2,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import {
    getMyPayrollSummary,
    getPayrollSummaryForManager,
    getPayrollSummaryAll,
    exportPayrollCsv,
} from '@/lib/actions/internal-payroll'
import type { PayrollSummary, PayrollBonusLine } from '@/lib/types/rates'
import { BONUS_CATEGORIES_PL, BONUS_MONTHS_PL, BONUS_QUARTERS_PL } from '@/lib/types/bonus'

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

function formatDateTime(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

const TIMESHEET_STATUS_PL: Record<PayrollSummary['timesheet_status'], string> = {
    approved: 'Zatwierdzony',
    submitted: 'Oczekuje',
    draft: 'Szkic',
    rejected: 'Odrzucony',
    missing: 'Brak',
}

/** Phase 32 — per-bonus "za co" detail lines, category aware. */
function bonusDetailRows(b: PayrollBonusLine): Array<{ label: string; value: string }> {
    const rows: Array<{ label: string; value: string }> = []
    switch (b.category) {
        case 'sales':
            if (b.client_name) rows.push({ label: 'Klient', value: b.client_name })
            if (b.sales_service_description)
                rows.push({ label: 'Opis usługi', value: b.sales_service_description })
            break
        case 'delivery_lead':
            if (b.client_name) rows.push({ label: 'Klient', value: b.client_name })
            if (b.delivery_candidate_name)
                rows.push({ label: 'Kandydat', value: b.delivery_candidate_name })
            if (b.delivery_margin_amount != null)
                rows.push({
                    label: 'Marża miesięczna',
                    value: `${b.delivery_margin_amount.toFixed(2)} PLN`,
                })
            if (b.delivery_margin_percent != null)
                rows.push({ label: 'Procent premii', value: `${b.delivery_margin_percent}%` })
            break
        case 'recruiter':
            if (b.client_name) rows.push({ label: 'Klient', value: b.client_name })
            if (b.recruiter_candidate_name)
                rows.push({ label: 'Kandydat', value: b.recruiter_candidate_name })
            if (b.recruiter_margin_per_hour != null)
                rows.push({
                    label: 'Marża',
                    value: `${b.recruiter_margin_per_hour.toFixed(2)} PLN/h`,
                })
            if (b.recruiter_calculated_tier)
                rows.push({ label: 'Próg', value: `${b.recruiter_calculated_tier}` })
            break
        case 'custom':
            if (b.custom_email_memo) rows.push({ label: 'Memo', value: b.custom_email_memo })
            break
        case 'champions_league':
            if (b.place_rank) rows.push({ label: 'Miejsce', value: `${b.place_rank}.` })
            if (b.period_quarter)
                rows.push({
                    label: 'Kwartał',
                    value: `${BONUS_QUARTERS_PL[b.period_quarter - 1]} ${b.period_year ?? ''}`.trim(),
                })
            break
    }
    rows.push({ label: 'Uzasadnienie', value: b.reason })
    if (b.notes) rows.push({ label: 'Notatka', value: b.notes })
    if (b.proposed_by_name) rows.push({ label: 'Przypisał', value: b.proposed_by_name })
    return rows
}

export function PayrollClient({
    initialTab,
    initialYear,
    initialMonth,
    isManager,
    isAdminOrFinanse,
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

    // Phase 32 — list-view filters (apply to team + all tables, client-side).
    const [query, setQuery] = useState<string>('')
    const [readyOnly, setReadyOnly] = useState<boolean>(false)

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

    // Apply person search + ready filter to the active list.
    const activeList = tab === 'team' ? teamSummaries : tab === 'all' ? allSummaries : null
    const filteredList = useMemo(() => {
        if (!activeList) return null
        const q = query.trim().toLowerCase()
        return activeList.filter((s) => {
            if (readyOnly && s.timesheet_status !== 'approved') return false
            if (q) {
                const hay = `${s.full_name ?? ''} ${s.email}`.toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
    }, [activeList, query, readyOnly])

    const readyCount = activeList?.filter((s) => s.timesheet_status === 'approved').length ?? 0
    const totalCount = activeList?.length ?? 0

    const isListTab = tab === 'team' || tab === 'all'

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
                {isListTab && isAdminOrFinanse && (
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

            {/* List-view filters: person search + ready-for-payout toggle */}
            {isListTab && !loading && activeList && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Szukaj po osobie (imię, nazwisko, email)…"
                            className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-sm"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={readyOnly}
                            onChange={(e) => setReadyOnly(e.target.checked)}
                            className="h-4 w-4 rounded border-border"
                        />
                        <span className="inline-flex items-center gap-1">
                            <Lock className="h-3.5 w-3.5 text-success" />
                            Tylko zatwierdzone (gotowe do wypłaty)
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {readyCount}/{totalCount}
                        </span>
                    </label>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="py-12 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : tab === 'mine' && mineSummary ? (
                <MineSummaryView summary={mineSummary} />
            ) : isListTab && filteredList ? (
                <SummaryTable
                    summaries={filteredList}
                    year={year}
                    month={month}
                    emptyText={
                        (activeList?.length ?? 0) === 0
                            ? tab === 'team'
                                ? 'Brak pracowników w Twoim zespole.'
                                : 'Brak danych dla wybranego miesiąca.'
                            : 'Brak wyników dla wybranego filtra.'
                    }
                />
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

            <BonusDetailList bonuses={summary.bonuses} />

            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Suma całkowita</span>
                <span className="text-2xl font-bold">
                    {summary.grand_total != null
                        ? formatMoney(summary.grand_total, summary.rate_currency)
                        : (
                              <span className="text-warning flex items-center gap-1 text-base">
                                  <AlertCircle className="h-4 w-4" />
                                  Mieszane waluty — patrz tabela
                              </span>
                          )}
                </span>
            </div>

            {summary.timesheet_status !== 'approved' && (
                <p className="text-xs text-warning">
                    Status timesheet: {TIMESHEET_STATUS_PL[summary.timesheet_status]}. Kwota
                    podstawowa zostanie sfinalizowana po akceptacji.
                </p>
            )}
        </div>
    )
}

/** Phase 32 — full bonus detail ("za co"). Used in Mine view + expandable rows. */
function BonusDetailList({ bonuses }: { bonuses: PayrollBonusLine[] }) {
    if (bonuses.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border bg-muted p-4 text-center text-sm text-muted-foreground">
                Brak premii w tym miesiącu.
            </div>
        )
    }
    return (
        <div className="space-y-2">
            {bonuses.map((b) => (
                <div key={b.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                            {b.category === 'champions_league' ? '🏆 ' : ''}
                            {BONUS_CATEGORIES_PL[b.category]}
                        </span>
                        <span className="font-semibold tabular-nums">
                            {b.amount.toFixed(2)} {b.currency}
                        </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-sm">
                        {bonusDetailRows(b).map((row, i) => (
                            <div key={i} className="contents">
                                <dt className="text-xs text-muted-foreground sm:text-right pt-0.5">
                                    {row.label}
                                </dt>
                                <dd className="whitespace-pre-wrap break-words">{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ))}
        </div>
    )
}

function SummaryTable({
    summaries,
    year,
    month,
    emptyText,
}: {
    summaries: PayrollSummary[]
    year: number
    month: number
    emptyText: string
}) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    function toggle(id: string) {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (summaries.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border bg-muted p-8 text-center text-muted-foreground">
                {emptyText}
            </div>
        )
    }
    return (
        <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="border-b border-border/40 text-xs text-muted-foreground sticky top-0 bg-background">
                    <tr>
                        <th className="w-8 p-2" />
                        <th className="text-left p-2 font-medium">Pracownik</th>
                        <th className="text-left p-2 font-medium">Rola</th>
                        <th className="text-right p-2 font-medium">Godziny</th>
                        <th className="text-right p-2 font-medium">Stawka</th>
                        <th className="text-right p-2 font-medium">Podstawowa</th>
                        <th className="text-right p-2 font-medium">Premie</th>
                        <th className="text-right p-2 font-medium">Suma</th>
                        <th className="text-left p-2 font-medium">Timesheet</th>
                        <th className="text-right p-2 font-medium">Pobierz</th>
                    </tr>
                </thead>
                <tbody>
                    {summaries.map((s) => {
                        const bonusBreakdown = Object.entries(s.bonus_totals_by_currency)
                            .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
                            .join(', ')
                        const isApproved = s.timesheet_status === 'approved'
                        const isOpen = expanded.has(s.user_id)
                        const hasDetail = s.bonuses.length > 0 || isApproved
                        return (
                            <FragmentRows
                                key={s.user_id}
                                s={s}
                                year={year}
                                month={month}
                                isApproved={isApproved}
                                isOpen={isOpen}
                                hasDetail={hasDetail}
                                bonusBreakdown={bonusBreakdown}
                                onToggle={() => toggle(s.user_id)}
                            />
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function FragmentRows({
    s,
    year,
    month,
    isApproved,
    isOpen,
    hasDetail,
    bonusBreakdown,
    onToggle,
}: {
    s: PayrollSummary
    year: number
    month: number
    isApproved: boolean
    isOpen: boolean
    hasDetail: boolean
    bonusBreakdown: string
    onToggle: () => void
}) {
    return (
        <>
            <tr className="border-b border-border/20">
                <td className="p-2 align-top">
                    {hasDetail && (
                        <button
                            type="button"
                            onClick={onToggle}
                            className="text-muted-foreground hover:text-foreground"
                            title="Szczegóły premii i akceptacji"
                            aria-label="Rozwiń szczegóły"
                        >
                            {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </button>
                    )}
                </td>
                <td className="p-2">
                    <div className="font-medium">{s.full_name ?? s.email}</div>
                    <div className="text-xs text-muted-foreground">{s.email}</div>
                </td>
                <td className="p-2 text-xs">{s.role}</td>
                <td className="p-2 text-right font-mono tabular-nums">{s.hours_total.toFixed(2)}</td>
                <td className="p-2 text-right font-mono tabular-nums">
                    {s.rate != null ? `${s.rate.toFixed(2)} ${s.rate_currency}/h` : '—'}
                </td>
                <td className="p-2 text-right font-mono tabular-nums">
                    {formatMoney(s.base_amount, s.rate_currency)}
                </td>
                <td className="p-2 text-right font-mono tabular-nums text-xs">
                    {bonusBreakdown || '—'}
                </td>
                <td className="p-2 text-right font-mono tabular-nums font-semibold">
                    {s.grand_total != null ? (
                        formatMoney(s.grand_total, s.rate_currency)
                    ) : (
                        <span className="text-warning text-[11px]">mieszane</span>
                    )}
                </td>
                <td className="p-2">
                    {isApproved ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                            <Lock className="h-3 w-3" />
                            Zatwierdzony
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            {TIMESHEET_STATUS_PL[s.timesheet_status]}
                        </span>
                    )}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                    {isApproved ? (
                        <a
                            href={`/internal/timesheet/${year}/${month}/pdf?user=${s.user_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Pobierz timesheet PDF tego pracownika"
                        >
                            <Button size="sm" variant="outline">
                                <FileDown className="h-3.5 w-3.5 mr-1" />
                                PDF
                            </Button>
                        </a>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    )}
                </td>
            </tr>
            {isOpen && hasDetail && (
                <tr className="border-b border-border/20 bg-muted/40">
                    <td />
                    <td colSpan={9} className="p-3">
                        <div className="space-y-3">
                            {isApproved && (
                                <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                    Timesheet zatwierdzony
                                    {s.timesheet_approved_by_name && (
                                        <> przez <strong>{s.timesheet_approved_by_name}</strong></>
                                    )}
                                    {s.timesheet_approved_at && (
                                        <> · {formatDateTime(s.timesheet_approved_at)}</>
                                    )}
                                    <span className="text-success/80">
                                        — zablokowany dla managera, gotowy do wypłaty
                                    </span>
                                </div>
                            )}
                            <div>
                                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                                    Premie ({s.bonuses.length})
                                </div>
                                <BonusDetailList bonuses={s.bonuses} />
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
            {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
        </div>
    )
}
