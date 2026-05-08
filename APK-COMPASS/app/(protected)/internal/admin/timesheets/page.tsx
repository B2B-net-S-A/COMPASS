import { listAllTimesheetsForMonth } from '@/lib/actions/internal-timesheet'
import { TimesheetAdminList } from '@/components/internal/TimesheetAdminList'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: { year?: string; month?: string }
}

export default async function AdminTimesheetsPage({ searchParams }: PageProps) {
    const now = new Date()
    const year = Number(searchParams?.year) || now.getFullYear()
    const monthRaw = Number(searchParams?.month) || now.getMonth() + 1
    const month = Math.min(12, Math.max(1, monthRaw))

    const timesheets = await listAllTimesheetsForMonth(year, month)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Timesheety</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Akceptuj/odrzuć timesheety pracowników wewnętrznych. Zaakceptowane można pobrać
                    jako PDF, a wszystkie razem jako ZIP.
                </p>
            </div>
            <TimesheetAdminList year={year} month={month} timesheets={timesheets} />
        </div>
    )
}
