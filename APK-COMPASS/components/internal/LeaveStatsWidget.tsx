import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, CalendarCheck, CalendarClock, Infinity as InfinityIcon } from 'lucide-react'
import type { MyLeaveBalance } from '@/lib/actions/internal-leave'

interface Props {
    balance: MyLeaveBalance
}

/**
 * Statystyki urlopowe per rok — B2B model bez limitu dni.
 * Pokazuje:
 *  - used (już wykorzystane dni vacation w bieżącym roku)
 *  - approved future (zatwierdzone na przyszłość)
 *  - pending (oczekujące na akceptację)
 *
 * Brak salda / limitu — wszyscy są na B2B i mogą brać tyle ile chcą,
 * pod warunkiem złożenia wniosku i akceptacji przez admina.
 */
export function LeaveStatsWidget({ balance }: Props) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-3">
                            <CalendarDays className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground">
                                Urlopy wypoczynkowe ({balance.year})
                            </h3>
                            <p className="text-2xl font-bold mt-1">
                                {balance.used_days}
                                <span className="text-sm text-muted-foreground font-normal ml-2">
                                    dni wykorzystane
                                </span>
                            </p>
                        </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground inline-flex items-center gap-1.5">
                        <InfinityIcon className="w-3.5 h-3.5" />
                        <span>B2B — bez limitu</span>
                    </div>
                </div>

                {(balance.pending_approved_future_days > 0 || balance.pending_request_days > 0) && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {balance.pending_approved_future_days > 0 && (
                            <div className="flex items-start gap-2 p-2 rounded bg-amber-500/5 border border-amber-500/20">
                                <CalendarCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-semibold text-amber-300">{balance.pending_approved_future_days} dni</div>
                                    <div className="text-muted-foreground text-[10px]">zatwierdzone na przyszłość</div>
                                </div>
                            </div>
                        )}
                        {balance.pending_request_days > 0 && (
                            <div className="flex items-start gap-2 p-2 rounded bg-white/5 border border-white/10">
                                <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-semibold">{balance.pending_request_days} dni</div>
                                    <div className="text-muted-foreground text-[10px]">oczekuje na akceptację</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
