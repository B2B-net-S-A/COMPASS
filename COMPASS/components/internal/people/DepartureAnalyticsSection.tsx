'use client'

// Analityka zejść kontraktorów: trend 12 miesięcy z rozbiciem na „kto zrezygnował" +
// zestawienia przeliczane w wybranym okresie. Filtry jadą przez query string, więc dane
// przelicza server component (AnalitykaTabPanel), a nie przeglądarka.

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Kpi, StatList, selectCls } from '@/components/internal/kontraktorzy/panels/shared'
import { WHO_RESIGNED_PL } from '@/lib/types/contractor'
import {
    DEPARTURE_PERIOD_PL,
    DEPARTURE_PERIODS,
    WHO_RESIGNED_KEYS,
    type DepartureAnalytics,
    type DeparturePeriod,
} from '@/lib/contractors/departure-analytics'
import { ExportDeparturesButton } from './ExportDeparturesButton'

const CATEGORY_COLORS: Record<(typeof WHO_RESIGNED_KEYS)[number], string> = {
    klient: 'hsl(var(--destructive))',
    kandydat: 'hsl(var(--warning))',
    koniec_zamowienia: 'hsl(var(--primary))',
    internalizacja: 'hsl(var(--success))',
    kandydat_klient: 'hsl(var(--accent-foreground))',
    nieznany: 'hsl(var(--muted-foreground))',
}

const MONTHS_SHORT_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

/** 'YYYY-MM' → 'lip 26' (oś wykresu musi się zmieścić w 12 słupkach). */
function shortPeriod(period: string): string {
    const [year, month] = period.split('-')
    return `${MONTHS_SHORT_PL[Number(month) - 1] ?? month} ${year.slice(2)}`
}

export function DepartureAnalyticsSection({ analytics }: { analytics: DepartureAnalytics }) {
    const router = useRouter()

    const chartData = useMemo(
        () => analytics.series12m.map((bucket) => ({ ...bucket, label: shortPeriod(bucket.period) })),
        [analytics.series12m],
    )
    const trendTotal = useMemo(
        () => analytics.series12m.reduce((sum, bucket) => sum + bucket.total, 0),
        [analytics.series12m],
    )
    /** Kategorie obecne w trendzie — nie zaśmiecamy legendy pustymi seriami. */
    const activeCategories = useMemo(
        () => WHO_RESIGNED_KEYS.filter((key) => analytics.series12m.some((bucket) => bucket[key] > 0)),
        [analytics.series12m],
    )

    function navigate(patch: { period?: DeparturePeriod; client?: string; recruiter?: string }) {
        const params = new URLSearchParams({ tab: 'analityka' })
        const period = patch.period ?? analytics.period
        const client = patch.client ?? analytics.client ?? ''
        const recruiter = patch.recruiter ?? analytics.recruiter ?? ''
        if (period !== 'last12') params.set('period', period)
        if (client) params.set('client', client)
        if (recruiter) params.set('recruiter', recruiter)
        router.push(`/internal/people?${params.toString()}`)
    }

    const filters = {
        period: analytics.period,
        client: analytics.client ?? undefined,
        recruiter: analytics.recruiter ?? undefined,
    }
    const periodLabel = DEPARTURE_PERIOD_PL[analytics.period].toLowerCase()

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Zejścia konsultantów</h2>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        aria-label="Okres"
                        className={selectCls}
                        value={analytics.period}
                        onChange={(e) => navigate({ period: e.target.value as DeparturePeriod })}
                    >
                        {DEPARTURE_PERIODS.map((p) => (
                            <option key={p} value={p}>{DEPARTURE_PERIOD_PL[p]}</option>
                        ))}
                    </select>
                    <select
                        aria-label="Klient"
                        className={selectCls}
                        value={analytics.client ?? ''}
                        onChange={(e) => navigate({ client: e.target.value })}
                    >
                        <option value="">Wszyscy klienci</option>
                        {analytics.clients.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <select
                        aria-label="Rekruter"
                        className={selectCls}
                        value={analytics.recruiter ?? ''}
                        onChange={(e) => navigate({ recruiter: e.target.value })}
                    >
                        <option value="">Wszyscy rekruterzy</option>
                        {analytics.recruiters.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                    <ExportDeparturesButton filters={filters} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi
                    label={`Zejścia — ${periodLabel}`}
                    value={analytics.total}
                    hint={`z ${analytics.totalAllTime} w całej bazie`}
                    accent="red"
                />
                <Kpi label="Ostatnie 12 mies." value={trendTotal} hint="suma słupków z wykresu" />
                <Kpi
                    label="Śr. na miesiąc"
                    value={(trendTotal / 12).toFixed(1).replace('.', ',')}
                    hint="z ostatnich 12 miesięcy"
                />
                <Kpi
                    label="Bez daty zejścia"
                    value={analytics.withoutDate}
                    hint={analytics.withoutDate > 0 ? 'poza trendem — uzupełnij w Excelu' : 'komplet dat'}
                    accent={analytics.withoutDate > 0 ? 'amber' : undefined}
                />
            </div>

            <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">
                    Trend miesięczny — ostatnie 12 miesięcy
                    {(analytics.client || analytics.recruiter) && (
                        <span className="ml-2 font-normal text-muted-foreground">
                            ({[analytics.client, analytics.recruiter].filter(Boolean).join(' · ')})
                        </span>
                    )}
                </h3>
                {trendTotal === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        Brak zejść w ostatnich 12 miesiącach dla tego filtra.
                    </p>
                ) : (
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Legend />
                                {activeCategories.map((key) => (
                                    <Bar
                                        key={key}
                                        stackId="who"
                                        dataKey={key}
                                        name={WHO_RESIGNED_PL[key]}
                                        fill={CATEGORY_COLORS[key]}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="p-2 text-left">Miesiąc</th>
                            {WHO_RESIGNED_KEYS.map((key) => (
                                <th key={key} className="p-2 text-right">{WHO_RESIGNED_PL[key]}</th>
                            ))}
                            <th className="p-2 text-right">Razem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {analytics.series12m.map((bucket) => (
                            <tr key={bucket.period} className="border-t">
                                <td className="p-2 whitespace-nowrap font-medium">{bucket.period}</td>
                                {WHO_RESIGNED_KEYS.map((key) => (
                                    <td key={key} className="p-2 text-right tabular-nums text-muted-foreground">
                                        {bucket[key] || '—'}
                                    </td>
                                ))}
                                <td className="p-2 text-right font-semibold tabular-nums">{bucket.total || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/30">
                        <tr>
                            <td className="p-2 font-semibold">Razem</td>
                            {WHO_RESIGNED_KEYS.map((key) => (
                                <td key={key} className="p-2 text-right font-semibold tabular-nums">
                                    {analytics.series12m.reduce((sum, b) => sum + b[key], 0) || '—'}
                                </td>
                            ))}
                            <td className="p-2 text-right font-bold tabular-nums">{trendTotal}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <StatList
                    title={`Kto zrezygnował — ${periodLabel}`}
                    rows={analytics.byWho.map((r) => ({ label: WHO_RESIGNED_PL[r.who], value: r.count }))}
                />
                <StatList
                    title={`Zejścia per klient — ${periodLabel}`}
                    rows={analytics.byClient.map((r) => ({ label: r.label, value: r.count }))}
                />
                <StatList
                    title={`Zejścia per rekruter — ${periodLabel}`}
                    rows={analytics.byRecruiter.map((r) => ({ label: r.label, value: r.count }))}
                />
            </div>
        </section>
    )
}
