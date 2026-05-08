import { listPendingLeaveRequests } from '@/lib/actions/internal-leave'
import { LeaveQueue } from '@/components/internal/LeaveQueue'

export async function AdminLeaveRequestsPanel() {
    const requests = await listPendingLeaveRequests()

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Wnioski urlopowe</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Kolejka wniosków oczekujących na akceptację. L4 jest auto-akceptowane i nie pojawia
                    się w tej liście.
                </p>
            </div>
            <LeaveQueue requests={requests} />
        </section>
    )
}
