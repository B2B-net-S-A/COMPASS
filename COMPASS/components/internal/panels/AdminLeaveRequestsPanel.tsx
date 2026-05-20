import {
    listLeavesWithSyncIssues,
    listPendingLeaveRequests,
} from '@/lib/actions/internal-leave'
import { LeaveQueue } from '@/components/internal/LeaveQueue'
import { AdminLeaveSyncIssues } from '@/components/internal/AdminLeaveSyncIssues'

export async function AdminLeaveRequestsPanel() {
    const [requests, syncIssues] = await Promise.all([
        listPendingLeaveRequests(),
        listLeavesWithSyncIssues().catch(() => []),
    ])

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Wnioski urlopowe</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Kolejka wniosków oczekujących na akceptację. L4 jest auto-akceptowane i nie pojawia
                    się w tej liście.
                </p>
            </div>
            <AdminLeaveSyncIssues requests={syncIssues} />
            <LeaveQueue requests={requests} />
        </section>
    )
}
