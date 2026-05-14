import { listAllTimesheetsForMonth } from '@/lib/actions/internal-timesheet'
import { TimesheetAdminList } from '@/components/internal/TimesheetAdminList'

interface Props {
    year?: number
    month?: number
}

export async function AdminTimesheetsPanel({ year, month }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))
    const timesheets = await listAllTimesheetsForMonth(y, m)

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Timesheety</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Akceptuj/odrzuć timesheety pracowników wewnętrznych. Zaakceptowane można pobrać
                    jako PDF, a wszystkie razem jako ZIP.
                </p>
            </div>
            <TimesheetAdminList year={y} month={m} timesheets={timesheets} />
        </section>
    )
}
