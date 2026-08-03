import { notFound } from 'next/navigation'
import { getOrCreateMyTimesheet, getMyOvertimeAllowed } from '@/lib/actions/internal-timesheet'
import { TimesheetEditor } from '@/components/internal/TimesheetEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { year: string; month: string }
}

export default async function TimesheetMonthPage({ params }: PageProps) {
    const year = Number(params.year)
    const month = Number(params.month)
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        notFound()
    }

    const [timesheet, canLogOvertime] = await Promise.all([
        getOrCreateMyTimesheet(year, month),
        getMyOvertimeAllowed(),
    ])

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Timesheet</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Loguj godziny przepracowane w danym miesiącu. Po złożeniu admin akceptuje
                    timesheet i generowany jest PDF do podpisania.
                </p>
            </div>
            <TimesheetEditor timesheet={timesheet} canLogOvertime={canLogOvertime} />
        </div>
    )
}
