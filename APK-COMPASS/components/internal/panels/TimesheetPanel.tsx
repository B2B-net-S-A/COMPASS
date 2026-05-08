import { getOrCreateMyTimesheet } from '@/lib/actions/internal-timesheet'
import { getActiveTimer, listPendingStoppedTimers } from '@/lib/actions/timesheet-timer'
import { TimesheetEditor } from '@/components/internal/TimesheetEditor'
import { TimesheetTimerWidget } from '@/components/internal/TimesheetTimerWidget'
import { TimerPendingList } from '@/components/internal/TimerPendingList'

interface Props {
    year?: number
    month?: number
}

export async function TimesheetPanel({ year, month }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))
    const [timesheet, activeTimer, pendingTimers] = await Promise.all([
        getOrCreateMyTimesheet(y, m),
        getActiveTimer(),
        listPendingStoppedTimers(y, m).catch(() => []),
    ])

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Timesheet</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Loguj godziny przepracowane w danym miesiącu. Po złożeniu admin akceptuje
                    timesheet i generowany jest PDF do podpisania.
                </p>
            </div>
            {/* H3.6: Timer widget — Beebole-style start/stop */}
            <TimesheetTimerWidget initialActive={activeTimer} />
            {/* H3.6: Pending stopped timers do skonwertowania na entries */}
            <TimerPendingList timers={pendingTimers} timesheetId={timesheet.id} hideIfEmpty />
            <TimesheetEditor timesheet={timesheet} />
        </section>
    )
}
