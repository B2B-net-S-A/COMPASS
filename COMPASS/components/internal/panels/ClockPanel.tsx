import { ChevronLeft, ChevronRight, Clock, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    getMyActivityRateForDay,
    getMyClockMonth,
    getMyClockSessionsForMonth,
} from '@/lib/actions/internal-clock'
import type { ClockSessionListItem } from '@/lib/clock/constants'
import { ActivityRateSparkline } from '@/components/internal/ActivityRateSparkline'
import { ClockTimelineView } from '@/components/internal/ClockTimelineView'

interface Props {
    year?: number
    month?: number
}

const CLOSED_REASON_LABEL: Record<string, { label: string; className: string }> = {
    manual: { label: 'Ręczne zamknięcie', className: 'bg-info/15 text-info border-info/30' },
    idle_timeout: { label: 'Auto: bezczynność', className: 'bg-warning/15 text-warning border-warning/30' },
    daily_cutoff: { label: 'Auto: koniec doby', className: 'bg-warning/15 text-warning border-warning/30' },
    sleep_detected: { label: 'Auto: uśpienie', className: 'bg-warning/15 text-warning border-warning/30' },
    taken_over: { label: 'Przejęta', className: 'bg-muted/15 text-muted-foreground border-muted/30' },
    admin_close: { label: 'Zamknięta przez admina', className: 'bg-destructive/15 text-destructive border-destructive/30' },
}

function formatHm(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h === 0) return `${m}m`
    return `${h}h ${m}m`
}

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('pl-PL', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export async function ClockPanel({ year, month }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))

    const today = format(new Date(), 'yyyy-MM-dd')
    const [monthData, sessions, todayActivity] = await Promise.all([
        getMyClockMonth(y, m),
        getMyClockSessionsForMonth(y, m),
        // R4: today's activity sparkline (user-only data — never shown to admin)
        getMyActivityRateForDay(today).catch(() => []),
    ])

    const prevMonth = m === 1 ? 12 : m - 1
    const prevYear = m === 1 ? y - 1 : y
    const nextMonth = m === 12 ? 1 : m + 1
    const nextYear = m === 12 ? y + 1 : y

    const monthLabel = new Date(y, m - 1, 1).toLocaleString('pl-PL', {
        month: 'long',
        year: 'numeric',
    })

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Clock className="h-5 w-5 text-info" />
                    Zegar pracy
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Zarejestrowane sesje pracy. Możesz wypełnić timesheet propozycjami z
                    trackingu — zob.{' '}
                    <Link href="/internal?tab=timesheet" className="text-info underline">
                        sekcja Timesheet
                    </Link>
                    .{' '}
                    <Link
                        href="/privacy/work-monitoring"
                        target="_blank"
                        className="inline-flex items-center gap-1 text-info underline"
                    >
                        <ShieldCheck className="h-3 w-3" />
                        Polityka monitoringu
                    </Link>
                </p>
            </div>

            {todayActivity.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Twoja aktywność dzisiaj</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ActivityRateSparkline buckets={todayActivity} />
                    </CardContent>
                </Card>
            )}

            {/* R12: AI timeline (only renders content if route metadata exists) */}
            <ClockTimelineView date={today} />

            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-lg capitalize">{monthLabel}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Suma:{' '}
                            <strong className="text-foreground">
                                {monthData.totalHours.toFixed(2)} h
                            </strong>{' '}
                            · sesji: <strong>{monthData.sessionCount}</strong>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href={`/internal?tab=clock&year=${prevYear}&month=${prevMonth}`}>
                            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                        </Link>
                        <Link href={`/internal?tab=clock&year=${nextYear}&month=${nextMonth}`}>
                            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {monthData.days.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                            Brak danych z trackingu w tym miesiącu.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                                Podsumowanie dzienne
                            </h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        <th className="text-left py-2 pr-2 font-medium">Data</th>
                                        <th className="text-left py-2 pr-2 font-medium">Pierwsze wejście</th>
                                        <th className="text-left py-2 pr-2 font-medium">Ostatnie wyjście</th>
                                        <th className="text-right py-2 pr-2 font-medium">Sesji</th>
                                        <th className="text-right py-2 pr-2 font-medium">Czas pracy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthData.days.map((d) => (
                                        <tr key={d.work_date} className="border-b border-border/40">
                                            <td className="py-2 pr-2 text-xs whitespace-nowrap font-mono">
                                                {d.work_date}
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {formatDateTime(d.first_clock_in)}
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {formatDateTime(d.last_clock_out)}
                                            </td>
                                            <td className="py-2 pr-2 text-right text-xs">
                                                {d.session_count}
                                            </td>
                                            <td className="py-2 pr-2 text-right font-mono text-xs">
                                                {Number(d.hours).toFixed(2)} h
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {sessions.length > 0 && (
                        <div className="overflow-x-auto">
                            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                                Pojedyncze sesje
                            </h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        <th className="text-left py-2 pr-2 font-medium">Start</th>
                                        <th className="text-left py-2 pr-2 font-medium">Koniec</th>
                                        <th className="text-left py-2 pr-2 font-medium">Urządzenie</th>
                                        <th className="text-left py-2 pr-2 font-medium">Lokalizacja</th>
                                        <th className="text-left py-2 pr-2 font-medium">Powód zamknięcia</th>
                                        <th className="text-right py-2 pr-2 font-medium">Aktywne</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map((s: ClockSessionListItem) => {
                                        const reason = s.closed_reason
                                            ? CLOSED_REASON_LABEL[s.closed_reason] ?? {
                                                  label: s.closed_reason,
                                                  className: 'bg-muted/15 text-muted-foreground border-muted/30',
                                              }
                                            : null
                                        return (
                                            <tr key={s.id} className="border-b border-border/40">
                                                <td className="py-2 pr-2 text-xs whitespace-nowrap">
                                                    {formatDateTime(s.started_at)}
                                                </td>
                                                <td className="py-2 pr-2 text-xs whitespace-nowrap">
                                                    {s.ended_at ? (
                                                        formatDateTime(s.ended_at)
                                                    ) : (
                                                        <Badge className="bg-success/15 text-success border-success/30">
                                                            Aktywna
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-2 text-xs">
                                                    {s.device_label ?? '—'}
                                                </td>
                                                <td className="py-2 pr-2 text-xs capitalize">
                                                    {s.location}
                                                </td>
                                                <td className="py-2 pr-2 text-xs">
                                                    {reason ? (
                                                        <Badge variant="outline" className={reason.className}>
                                                            {reason.label}
                                                        </Badge>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="py-2 pr-2 text-right font-mono text-xs">
                                                    {formatHm(s.active_seconds)}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}
