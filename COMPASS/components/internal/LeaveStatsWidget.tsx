import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, CalendarCheck, CalendarClock, Infinity as InfinityIcon } from 'lucide-react'
import type { MyLeaveBalance } from '@/lib/actions/internal-leave'

interface Props {
    balance: MyLeaveBalance
}

/**
 * Statystyki urlopowe per rok.
 *  - UoP z limitem: pokazuje "X dni pozostało" + breakdown wymiar/zaległy/zużyte.
 *  - UoP bez limitu (entitlement IS NULL): "X dni wykorzystane" + badge "Bez limitu".
 *  - B2B/zlecenie z pulą (Phase 30): "X dni pozostało" jak UoP. Pula z kontraktu.
 *  - B2B/zlecenie bez puli: widget w ogóle nie renderuje się (parent ukrywa).
 */
export function LeaveStatsWidget({ balance }: Props) {
    const isContractor = balance.employment_type === 'b2b' || balance.employment_type === 'zlecenie'
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
                                {balance.has_limit && isContractor
                                    ? `Pula płatnych urlopów (${balance.year})`
                                    : `Urlop wypoczynkowy (${balance.year})`}
                            </h3>
                            {balance.has_limit ? (
                                <p
                                    className={`text-2xl font-bold mt-1 ${
                                        (balance.remaining_days ?? 0) < 0 ? 'text-red-400' : ''
                                    }`}
                                >
                                    {balance.remaining_days}
                                    <span className="text-sm text-muted-foreground font-normal ml-2">
                                        dni pozostało
                                    </span>
                                </p>
                            ) : (
                                <p className="text-2xl font-bold mt-1">
                                    {balance.used_days}
                                    <span className="text-sm text-muted-foreground font-normal ml-2">
                                        dni wykorzystane
                                    </span>
                                </p>
                            )}
                        </div>
                    </div>
                    {balance.has_limit ? (
                        <div className="text-right text-xs text-muted-foreground">
                            <div>
                                Wymiar: {balance.entitlement_days}
                                {balance.carried_over_days > 0 ? ` + ${balance.carried_over_days} zaległe` : ''}
                                {balance.used_initial_days > 0 ? ` − ${balance.used_initial_days} zaległo zużyte` : ''}{' '}
                                dni
                            </div>
                            <div className="mt-0.5">Wykorzystane w {balance.year}: {balance.used_days} dni</div>
                        </div>
                    ) : (
                        <div className="text-right text-xs text-muted-foreground inline-flex items-center gap-1.5">
                            <InfinityIcon className="w-3.5 h-3.5" />
                            <span>{isContractor ? 'Bez puli płatnych' : 'Bez limitu'}</span>
                        </div>
                    )}
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
