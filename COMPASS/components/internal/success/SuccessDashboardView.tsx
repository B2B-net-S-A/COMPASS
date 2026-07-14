import Link from 'next/link'
import { AlertTriangle, CalendarClock, CalendarDays, ClipboardCheck, HeartPulse, Users } from 'lucide-react'
import { StatCard, StatCardGrid } from '@/components/ds/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckInStatusBadge, HealthBadge, PriorityBadge, formatSuccessDate } from './SuccessBadges'
import { SuccessEmptyState } from './SuccessStates'
import { DeadDeliveriesPanel } from './DeadDeliveriesPanel'
import type { SuccessDashboard, SuccessHealthStatus } from '@/lib/types/consultant-success'

const HEALTH_LABEL: Record<SuccessHealthStatus, string> = {
    unknown: 'Bez statusu',
    green: 'Zielone',
    amber: 'Żółte',
    red: 'Czerwone',
}

export function SuccessDashboardView({ dashboard }: { dashboard: SuccessDashboard }) {
    const distribution = new Map(dashboard.healthDistribution.map((item) => [item.status, item.count]))

    return (
        <div className="space-y-6">
            <StatCardGrid>
                <StatCard label="Monitoring aktywny" value={dashboard.stats.monitored} sub="konsultantów w cyklu" icon={Users} />
                <StatCard label="Check-iny dzisiaj" value={dashboard.stats.dueToday} sub={`${dashboard.stats.upcoming7Days} w kolejnych 7 dniach`} icon={CalendarDays} />
                <StatCard label="Po terminie" value={dashboard.stats.overdue} sub="wymagają zaplanowania lub kontaktu" icon={AlertTriangle} className={dashboard.stats.overdue > 0 ? 'border-destructive/30' : undefined} />
                <StatCard label="Otwarte action steps" value={dashboard.stats.openTasks} sub="ustalenia do domknięcia" icon={ClipboardCheck} />
            </StatCardGrid>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                <section className="rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                        <div>
                            <h2 className="font-semibold text-foreground">Priorytety na teraz</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Check-iny, action steps i relacje wymagające reakcji.</p>
                        </div>
                        <Button asChild variant="outline" size="sm"><Link href="/internal/people/success/check-ins?state=overdue">Pokaż check-iny</Link></Button>
                    </div>
                    {dashboard.priorityItems.length === 0 ? (
                        <div className="p-5"><SuccessEmptyState title="Kolejka jest pusta" description="Nie ma przeterminowanych check-inów ani pilnych działań." /></div>
                    ) : (
                        <ol className="divide-y divide-border">
                            {dashboard.priorityItems.slice(0, 12).map((item) => (
                                <li key={`${item.kind}-${item.id}`}>
                                    <Link href={item.href} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                            {item.kind === 'health' ? <HeartPulse className="h-4 w-4" /> : item.kind === 'check_in' ? <CalendarClock className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-foreground">{item.contractorName}</span>
                                            <span className="block text-sm text-muted-foreground">{item.title}</span>
                                            {item.subtitle ? <span className="mt-0.5 block text-xs text-muted-foreground">{item.subtitle}</span> : null}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                            <PriorityBadge priority={item.priority} />
                                            {item.dueAt ? <time dateTime={item.dueAt} className="text-xs text-muted-foreground">{formatSuccessDate(item.dueAt, true)}</time> : null}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                <div className="space-y-6">
                    <section className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div><h2 className="font-semibold text-foreground">Status relacji</h2><p className="mt-1 text-xs text-muted-foreground">Ręcznie ustawiany przez TCM</p></div>
                            <Badge variant={dashboard.stats.atRisk > 0 ? 'warning' : 'success'}>{dashboard.stats.atRisk} wymaga uwagi</Badge>
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            {(['green', 'amber', 'red', 'unknown'] as const).map((status) => (
                                <div key={status} className="rounded-lg border border-border p-3">
                                    <div className="flex items-center justify-between gap-2"><HealthBadge status={status} /><span className="text-xl font-semibold tabular-nums">{distribution.get(status) ?? 0}</span></div>
                                    <p className="mt-2 text-xs text-muted-foreground">{HEALTH_LABEL[status]}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between"><h2 className="font-semibold text-foreground">Pulse survey</h2><HeartPulse className="h-4 w-4 text-muted-foreground" /></div>
                        <p className="mt-3 text-3xl font-semibold tabular-nums">{dashboard.stats.awaitingPulse}</p>
                        <p className="mt-1 text-sm text-muted-foreground">ankiet oczekuje na odpowiedź</p>
                    </section>
                </div>
            </div>

            <section className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-5">
                    <div><h2 className="font-semibold text-foreground">Najbliższe check-iny</h2><p className="mt-1 text-sm text-muted-foreground">Plan rozmów całego zespołu TCM.</p></div>
                    <Button asChild variant="ghost" size="sm"><Link href="/internal/people/success/check-ins">Pełny harmonogram</Link></Button>
                </div>
                {dashboard.upcomingCheckIns.length === 0 ? <div className="p-5"><SuccessEmptyState title="Brak zaplanowanych rozmów" description="Uruchom monitoring konsultanta albo zaplanuj check-in z jego profilu." action={{ label: 'Otwórz konsultantów', href: '/internal/people/success/consultants' }} /></div> : (
                    <div className="divide-y divide-border">
                        {dashboard.upcomingCheckIns.slice(0, 8).map((checkIn) => (
                            <Link key={checkIn.id} href={`/internal/people/success/check-ins/${checkIn.id}`} className="flex flex-col gap-2 p-4 hover:bg-muted/35 sm:flex-row sm:items-center">
                                <time className="w-40 shrink-0 text-sm font-medium" dateTime={checkIn.scheduledAt}>{formatSuccessDate(checkIn.scheduledAt, true)}</time>
                                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{checkIn.contractorName}</span><span className="block truncate text-xs text-muted-foreground">{checkIn.clientName ?? 'Bez klienta'} · {checkIn.ownerTcmName ?? 'bez opiekuna'}</span></span>
                                <CheckInStatusBadge status={checkIn.status} />
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <DeadDeliveriesPanel deliveries={dashboard.deadDeliveries} />
        </div>
    )
}
