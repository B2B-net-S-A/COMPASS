import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays } from 'lucide-react'
import type { MyLeaveBalance } from '@/lib/actions/internal-leave'

interface Props {
    balance: MyLeaveBalance
}

export function LeaveBalanceWidget({ balance }: Props) {
    const pct = balance.annual_leave_days
        ? Math.min(100, Math.round((balance.used_days / balance.annual_leave_days) * 100))
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
                        <div className="text-base text-foreground">
                            {balance.used_days} dni
                        </div>
                    </div>
                </div>

                <div className="mt-4 h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </CardContent>
        </Card>
    )
}
