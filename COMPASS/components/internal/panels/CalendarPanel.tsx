import { getTeamCalendar } from '@/lib/actions/internal-attendance'
import { VacationCalendar } from '@/components/internal/VacationCalendar'

interface Props {
    year?: number
    month?: number
    filter?: 'all' | 'internal' | 'admin'
}

export async function CalendarPanel({ year, month, filter = 'all' }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))
    const data = await getTeamCalendar(y, m)

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Kalendarz urlopów zespołu</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Widok wszystkich pracowników strefy HR (wewnętrzni, managerowie, finanse,
                    talent community, admini) na cały miesiąc. Pokazuje zaakceptowane urlopy,
                    delegacje, szkolenia i pracę zdalną.
                </p>
            </div>
            <VacationCalendar data={data} filter={filter} />
        </section>
    )
}
