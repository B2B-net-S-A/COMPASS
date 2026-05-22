import {
    listLeavesWithSyncIssues,
    listPendingLeaveRequests,
} from '@/lib/actions/internal-leave'
import { LeaveQueue } from '@/components/internal/LeaveQueue'
import { AdminLeaveSyncIssues } from '@/components/internal/AdminLeaveSyncIssues'

interface Props {
    isAdmin: boolean
}

export async function AdminLeaveRequestsPanel({ isAdmin }: Props) {
    // Sync-issues (Graph OOF/calendar repair) + retry są tylko dla admina.
    const [requests, syncIssues] = await Promise.all([
        listPendingLeaveRequests(),
        isAdmin ? listLeavesWithSyncIssues().catch(() => []) : Promise.resolve([]),
    ])

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Wnioski urlopowe</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    {isAdmin
                        ? 'Kolejka wniosków oczekujących na akceptację. L4 jest auto-akceptowane i nie pojawia się w tej liście.'
                        : 'Wnioski urlopowe Twojego zespołu oczekujące na akceptację. L4 jest auto-akceptowane i nie pojawia się w tej liście.'}
                </p>
            </div>
            {isAdmin && <AdminLeaveSyncIssues requests={syncIssues} />}
            <LeaveQueue requests={requests} />
        </section>
    )
}
