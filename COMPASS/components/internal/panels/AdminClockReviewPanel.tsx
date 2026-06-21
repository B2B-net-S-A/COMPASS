import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listClockSessionsForReview } from '@/lib/actions/internal-clock'
import { AdminClockReviewActions } from '@/components/internal/AdminClockReviewActions'

interface Props {
    year?: number
    month?: number
}

export async function AdminClockReviewPanel({ year, month }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))

    const entries = await listClockSessionsForReview(y, m)

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Korekty godzin pracy
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Wpisy w timesheetach gdzie zadeklarowane godziny różnią się o {'>'}1h od trackingu
                    lub przekraczają ustawowy limit 13h dziennie (KP art. 129).
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">
                        {entries.length === 0
                            ? 'Brak korekt do akceptacji'
                            : `${entries.length} wpis${entries.length === 1 ? '' : 'ów'} do decyzji`}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                            Wszystkie wpisy są zgodne z trackingiem ±1h.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                        <th className="text-left py-2 pr-2 font-medium">Pracownik</th>
                                        <th className="text-left py-2 pr-2 font-medium">Data</th>
                                        <th className="text-right py-2 pr-2 font-medium">Zadeklarowane</th>
                                        <th className="text-right py-2 pr-2 font-medium">Z trackingu</th>
                                        <th className="text-right py-2 pr-2 font-medium">Różnica</th>
                                        <th className="text-left py-2 pr-2 font-medium">Opis</th>
                                        <th className="py-2 pr-2 font-medium">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.map((e) => (
                                        <tr key={e.entry_id} className="border-b border-border/40">
                                            <td className="py-2 pr-2 text-xs">
                                                <div className="font-medium">{e.user_full_name ?? e.user_email}</div>
                                                {e.user_full_name && (
                                                    <div className="text-muted-foreground text-[10px]">
                                                        {e.user_email}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 pr-2 text-xs whitespace-nowrap font-mono">
                                                {e.work_date}
                                            </td>
                                            <td className="py-2 pr-2 text-right font-mono text-xs">
                                                {e.hours.toFixed(2)} h
                                                {e.hours > 13 && (
                                                    <span className="ml-1 text-[10px] text-destructive">
                                                        ⚠ KP
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-2 text-right font-mono text-xs text-muted-foreground">
                                                {e.tracked_hours == null
                                                    ? '—'
                                                    : `${e.tracked_hours.toFixed(2)} h`}
                                            </td>
                                            <td className="py-2 pr-2 text-right font-mono text-xs">
                                                {e.declared_minus_tracked == null ? (
                                                    '—'
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            Math.abs(e.declared_minus_tracked) > 2
                                                                ? 'bg-destructive/15 text-destructive border-destructive/30'
                                                                : 'bg-warning/15 text-warning border-warning/30'
                                                        }
                                                    >
                                                        {e.declared_minus_tracked > 0 ? '+' : ''}
                                                        {e.declared_minus_tracked.toFixed(2)} h
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-2 pr-2 text-xs max-w-[300px]">
                                                <span className="line-clamp-2">{e.description}</span>
                                            </td>
                                            <td className="py-2 pr-2">
                                                <AdminClockReviewActions
                                                    entryId={e.entry_id}
                                                    workDate={e.work_date}
                                                    declaredHours={e.hours}
                                                    trackedHours={e.tracked_hours}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}
