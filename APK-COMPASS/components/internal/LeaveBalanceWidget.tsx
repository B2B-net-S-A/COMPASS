import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, CalendarCheck, CalendarClock } from 'lucide-react'
import type { MyLeaveBalance } from '@/lib/actions/internal-leave'

interface Props {
    balance: MyLeaveBalance
}

/**
 * H2.5: rozszerzony widget z 4 wartościami:
 *  - used (już wykorzystane do dziś)
 *  - approved future (zatwierdzone na przyszłość)
 *  - pending (oczekujące na akceptację)
 *  - projected remaining (saldo na koniec roku po wykorzystaniu wszystkich planów)
 */
export function LeaveBalanceWidget({ balance }: Props) {
    const usedPct = balance.annual_leave_days
        ? Math.min(100, Math.round((balance.used_days / balance.annual_leave_days) * 100))
        : 0
    const futurePct = balance.annual_leave_days
        ? Math.min(
              100 - usedPct,
              Math.round((balance.pending_approved_future_days / balance.annual_leave_days) * 100),
          )
        : 0
    const pendingPct = balance.annual_leave_days
        ? Math.min(
              100 - usedPct - futurePct,
              Math.round((balance.pending_request_days / balance.annual_leave_days) * 100),
          )
        : 0

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
                                Saldo urlopu wypoczynkowego ({balance.year})
                            </h3>
                            <p className="text-2xl font-bold mt-1">
                                {balance.remaining_days}
                                <span className="text-sm text-muted-foreground font-normal ml-2">
                                    / {balance.annual_leave_days} dni
                                </span>
                            </p>
                        </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                        <div>Wykorzystano</div>
                        <div className="text-base text-foreground">{balance.used_days} dni</div>
                    </div>
                </div>

                {/* Stack-bar: used (primary) + future approved (amber) + pending (muted) */}
                <div className="mt-4 h-2 w-full bg-muted rounded-full overflow-hidden flex">
                    <div className="h-full bg-primary transition-all" style={{ width: `${usedPct}%` }} />
                    <div className="h-full bg-amber-500/70 transition-all" style={{ width: `${futurePct}%` }} />
                    <div className="h-full bg-muted-foreground/40 transition-all" style={{ width: `${pendingPct}%` }} />
                </div>

                {/* H2.5: projection breakdown */}
                {(balance.pending_approved_future_days > 0 || balance.pending_request_days > 0) && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
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
                        <div className="flex items-start gap-2 p-2 rounded bg-primary/5 border border-primary/20">
                            <CalendarDays className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <div>
                                <div className="font-semibold text-primary">{balance.projected_remaining_days} dni</div>
                                <div className="text-muted-foreground text-[10px]">prognoza na koniec roku</div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
