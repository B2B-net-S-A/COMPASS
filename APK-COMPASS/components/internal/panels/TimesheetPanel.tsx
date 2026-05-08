import { getOrCreateMyTimesheet } from '@/lib/actions/internal-timesheet'
import { TimesheetEditor } from '@/components/internal/TimesheetEditor'

interface Props {
    year?: number
    month?: number
}

export async function TimesheetPanel({ year, month }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))
    const timesheet = await getOrCreateMyTimesheet(y, m)

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Timesheet</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Loguj godziny przepracowane w danym miesiącu. Po złożeniu admin akceptuje
                    timesheet i generowany jest PDF do podpisania.
                </p>
            </div>
            <TimesheetEditor timesheet={timesheet} />
        </section>
    )
}
