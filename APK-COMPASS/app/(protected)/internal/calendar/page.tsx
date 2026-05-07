import { getTeamCalendar } from '@/lib/actions/internal-attendance'
import { VacationCalendar } from '@/components/internal/VacationCalendar'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: { year?: string; month?: string; filter?: string }
}

export default async function VacationCalendarPage({ searchParams }: PageProps) {
    const now = new Date()
    const year = Number(searchParams?.year) || now.getFullYear()
    const monthRaw = Number(searchParams?.month) || now.getMonth() + 1
    const month = Math.min(12, Math.max(1, monthRaw))
    const filter = (searchParams?.filter ?? 'all') as 'all' | 'internal' | 'admin'

    const data = await getTeamCalendar(year, month)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Kalendarz urlopów zespołu</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Widok wszystkich pracowników wewnętrznych i adminów na cały miesiąc.
                    Pokazuje zaakceptowane urlopy, delegacje i szkolenia.
                </p>
            </div>
            <VacationCalendar data={data} filter={filter} />
        </div>
    )
}
