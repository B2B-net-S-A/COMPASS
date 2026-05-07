import { getMyMonth } from '@/lib/actions/internal-attendance'
import { MonthlyAttendanceGrid } from '@/components/internal/MonthlyAttendanceGrid'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: { year?: string; month?: string }
}

export default async function InternalAttendancePage({ searchParams }: PageProps) {
    const now = new Date()
    const year = Number(searchParams?.year) || now.getFullYear()
    const monthRaw = Number(searchParams?.month) || now.getMonth() + 1
    const month = Math.min(12, Math.max(1, monthRaw))

    const data = await getMyMonth(year, month)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Lista obecności</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Zaznaczaj dzień po dniu. Dni robocze bez wpisu liczymy jako{' '}
                    <strong>
                        praca {data.defaultLocation === 'onsite' ? 'w biurze' : 'zdalnie'}
                    </strong>
                    {' '}— klikaj tylko gdy odbiega od domyślnego.
                </p>
            </div>
            <MonthlyAttendanceGrid data={data} />
        </div>
    )
}
