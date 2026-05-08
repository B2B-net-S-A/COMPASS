import { getMyMonth } from '@/lib/actions/internal-attendance'
import { MonthlyAttendanceGrid } from '@/components/internal/MonthlyAttendanceGrid'

interface Props {
    year?: number
    month?: number
}

export async function AttendancePanel({ year, month }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))
    const data = await getMyMonth(y, m)

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Lista obecności</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Zaznaczaj dzień po dniu. Dni robocze bez wpisu liczymy jako{' '}
                    <strong>
                        praca {data.defaultLocation === 'onsite' ? 'w biurze' : 'zdalnie'}
                    </strong>
                    {' '}— klikaj tylko gdy odbiega od domyślnego.
                </p>
            </div>
            <MonthlyAttendanceGrid data={data} />
        </section>
    )
}
