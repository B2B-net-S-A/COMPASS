import Link from 'next/link'
import { getLifecycleAnalytics } from '@/lib/actions/lifecycle'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { BarChart3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

const EXIT_REASON_LABEL: Record<string, string> = {
    new_opportunity: 'Nowa praca',
    compensation: 'Wynagrodzenie',
    role_misfit: 'Niedopasowanie roli',
    management: 'Zarządzanie',
    work_life_balance: 'Work-life balance',
    career_growth: 'Rozwój kariery',
    personal: 'Powody osobiste',
    other: 'Inne',
}

export default async function LifecycleAnalyticsPage() {
    await requireLifecycleManagerAction()
    const analytics = await getLifecycleAnalytics()

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <BarChart3 className="h-7 w-7 text-green-400" />
                        Lifecycle Analytics
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Okres: {analytics.period.from} → {analytics.period.to}
                    </p>
                </div>
                <Link href="/internal/lifecycle" className="text-sm underline text-muted-foreground">
                    ← Powrót do hub
                </Link>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Stat label="Aktywne onboardingi" value={analytics.activeOnboardings} />
                <Stat label="Ukończone (90 dni)" value={analytics.completedOnboardings} />
                <Stat
                    label="Średni czas onboardingu"
                    value={analytics.avgOnboardingDays !== null ? `${Math.round(analytics.avgOnboardingDays)} dni` : '—'}
                />
                <Stat label="Overdue zadania" value={analytics.overdueTasks} accent="text-red-400" />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border bg-card p-4">
                    <h2 className="font-semibold mb-3">Exit Interview NPS</h2>
                    <div className="text-5xl font-bold">
                        {analytics.avgExitNps !== null ? analytics.avgExitNps.toFixed(1) : '—'}
                        <span className="text-base text-muted-foreground"> / 10</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Średnia z {analytics.completedExitInterviews} wypełnionych ankiet (90 dni).
                    </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                    <h2 className="font-semibold mb-3">Top powody odejść</h2>
                    {analytics.topExitReasons.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Brak danych.</p>
                    ) : (
                        <ul className="space-y-2">
                            {analytics.topExitReasons.map((r) => (
                                <li key={r.reason} className="flex items-center justify-between text-sm">
                                    <span>{EXIT_REASON_LABEL[r.reason] ?? r.reason}</span>
                                    <span className="font-mono text-muted-foreground">{r.count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            <section className="rounded-lg border bg-card p-4">
                <h2 className="font-semibold mb-3">Retention per rola</h2>
                {analytics.retentionByRole.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Brak danych.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground">
                            <tr>
                                <th className="text-left p-2">Rola</th>
                                <th className="text-left p-2">Łącznie</th>
                                <th className="text-left p-2">Retention</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analytics.retentionByRole.map((r) => (
                                <tr key={r.role} className="border-t">
                                    <td className="p-2 capitalize">{r.role.replace('_', ' ')}</td>
                                    <td className="p-2">{r.total}</td>
                                    <td className="p-2">
                                        <span
                                            className={
                                                r.retention_rate >= 0.9
                                                    ? 'text-green-400'
                                                    : r.retention_rate >= 0.75
                                                        ? 'text-amber-400'
                                                        : 'text-red-400'
                                            }
                                        >
                                            {Math.round(r.retention_rate * 100)}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    )
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground">{label}</div>
            <div className={`text-3xl font-bold mt-1 ${accent ?? ''}`}>{value}</div>
        </div>
    )
}
