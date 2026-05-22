import { getMyLeaveBalance, listMyLeaveRequests } from '@/lib/actions/internal-leave'
import { LeaveStatsWidget } from '@/components/internal/LeaveStatsWidget'
import { LeaveRequestForm } from '@/components/internal/LeaveRequestForm'
import { MyLeaveList } from '@/components/internal/MyLeaveList'

export async function LeavePanel() {
    const [balance, requests] = await Promise.all([
        getMyLeaveBalance(),
        listMyLeaveRequests(),
    ])

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Moje urlopy</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Wnioski i historia. B2B — bez limitu dni, ale każda nieobecność wymaga zgłoszenia
                    i akceptacji admina (poza L4, które są auto-zatwierdzane).
                </p>
            </div>
            <LeaveStatsWidget balance={balance} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LeaveRequestForm isUop={balance.employment_type === 'uop'} />
                <MyLeaveList requests={requests} />
            </div>
        </section>
    )
}
