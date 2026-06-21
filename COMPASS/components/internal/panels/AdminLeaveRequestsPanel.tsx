import {
    listLeavesWithSyncIssues,
    listLeavesWithUserCustomOof,
    listPendingLeaveRequests,
} from '@/lib/actions/internal-leave'
import { LeaveQueue } from '@/components/internal/LeaveQueue'
import { AdminLeaveSyncIssues } from '@/components/internal/AdminLeaveSyncIssues'
import { AdminLeavePreservedOof } from '@/components/internal/AdminLeavePreservedOof'

interface Props {
    isAdmin: boolean
}

export async function AdminLeaveRequestsPanel({ isAdmin }: Props) {
    // Sync-issues (Graph OOF/calendar repair) + retry + Phase 25d preserved OOF info — admin only.
    const [requests, syncIssues, preservedOof] = await Promise.all([
        listPendingLeaveRequests(),
        isAdmin ? listLeavesWithSyncIssues().catch(() => []) : Promise.resolve([]),
        isAdmin ? listLeavesWithUserCustomOof().catch(() => []) : Promise.resolve([]),
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
            {isAdmin && <AdminLeavePreservedOof requests={preservedOof} />}
            <LeaveQueue requests={requests} />
        </section>
    )
}
