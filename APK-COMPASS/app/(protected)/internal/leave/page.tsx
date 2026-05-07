import { getMyLeaveBalance, listMyLeaveRequests } from '@/lib/actions/internal-leave'
import { LeaveBalanceWidget } from '@/components/internal/LeaveBalanceWidget'
import { LeaveRequestForm } from '@/components/internal/LeaveRequestForm'
import { MyLeaveList } from '@/components/internal/MyLeaveList'

export const dynamic = 'force-dynamic'

export default async function MyLeavePage() {
    const [balance, requests] = await Promise.all([
        getMyLeaveBalance(),
        listMyLeaveRequests(),
    ])

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Moje urlopy</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Saldo, wnioski i historia. Wnioski (poza L4) wymagają akceptacji admina.
                </p>
            </div>

            <LeaveBalanceWidget balance={balance} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LeaveRequestForm />
                <MyLeaveList requests={requests} />
            </div>
        </div>
    )
}
