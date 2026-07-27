import {
    listLeavesWithSyncIssues,
    listLeavesWithUserCustomOof,
    listPendingLeaveRequests,
} from '@/lib/actions/internal-leave'
import { listForwardRulesFromDb } from '@/lib/actions/leave-forward-admin'
import { LeaveQueue } from '@/components/internal/LeaveQueue'
import { AdminLeaveSyncIssues } from '@/components/internal/AdminLeaveSyncIssues'
import { AdminLeavePreservedOof } from '@/components/internal/AdminLeavePreservedOof'
import { AdminForwardRules } from '@/components/internal/AdminForwardRules'
import { maybeSelfHealForwardRules } from '@/lib/oof/forward-self-heal'
import { createServiceClient } from '@/lib/supabase/admin'

interface Props {
    isAdmin: boolean
}

export async function AdminLeaveRequestsPanel({ isAdmin }: Props) {
    // Phase 41c — samoleczenie. Uzgodnienie przekierowań miało należeć do crona, ale
    // crony tej instancji nie wykonują się (weryfikacja 2026-07-27), więc reguły
    // zostawały otwarte po urlopach. Odpalamy je przy okazji wejścia na kolejkę
    // wniosków: ktoś z HR bywa tu codziennie, więc system domyka się sam.
    //
    // Świadomie bez await — skan skrzynek trwa kilkanaście sekund i nie ma prawa
    // opóźniać renderu. Wewnętrzny throttle (raz na godzinę, liczony z audit_logs)
    // pilnuje, żeby odświeżenie strony nie oznaczało kolejnego skanu.
    if (isAdmin) {
        void maybeSelfHealForwardRules(createServiceClient())
    }

    // Sync-issues (Graph OOF/calendar repair) + retry + Phase 25d preserved OOF info — admin only.
    const [requests, syncIssues, preservedOof, forwardRules] = await Promise.all([
        listPendingLeaveRequests(),
        isAdmin ? listLeavesWithSyncIssues().catch(() => []) : Promise.resolve([]),
        isAdmin ? listLeavesWithUserCustomOof().catch(() => []) : Promise.resolve([]),
        isAdmin ? listForwardRulesFromDb().catch(() => []) : Promise.resolve([]),
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
            {isAdmin && <AdminForwardRules initial={forwardRules} />}
            <LeaveQueue requests={requests} />
        </section>
    )
}
