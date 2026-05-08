import { listPendingLeaveRequests } from '@/lib/actions/internal-leave'
import { LeaveQueue } from '@/components/internal/LeaveQueue'

export const dynamic = 'force-dynamic'

export default async function AdminLeaveRequestsPage() {
    const requests = await listPendingLeaveRequests()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Wnioski urlopowe</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Kolejka wniosków oczekujących na akceptację. L4 jest auto-akceptowane i nie pojawia
                    się w tej liście.
                </p>
            </div>
            <LeaveQueue requests={requests} />
        </div>
    )
}
