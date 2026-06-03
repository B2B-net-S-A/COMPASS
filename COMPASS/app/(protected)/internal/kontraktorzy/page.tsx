// Phase 33/34/35 — Kontraktorzy hub (TCM + admin). Loads data server-side, renders the journey hub.

import {
    listContractors, listConversations, listEntries, listDepartures,
    getContractorDashboard, listTcmProfiles,
    listOnboardingQueue, listExitInterviewQueue, listTasks,
} from '@/lib/actions/contractors'
import { listInboxTickets } from '@/lib/actions/support-inbox'
import { KontraktorzyHub } from '@/components/internal/kontraktorzy/KontraktorzyHub'
import type { OpenInboxTicketLite } from '@/lib/types/support'

export const dynamic = 'force-dynamic'

export default async function KontraktorzyPage() {
    const [
        dashboard, conversations, contractors, entries, departures, tcmProfiles,
        onboardingQueue, exitQueue, tasks, inboxTicketsRes,
    ] = await Promise.all([
        getContractorDashboard(),
        listConversations({ limit: 800 }),
        listContractors(),
        listEntries(),
        listDepartures(),
        listTcmProfiles(),
        listOnboardingQueue(),
        listExitInterviewQueue(),
        listTasks(),
        listInboxTickets(),
    ])

    const contractorsLite = contractors.map((c) => ({ id: c.id, full_name: c.full_name }))

    // Open inbox tickets for the "Sprawy otwarte" tab (graceful empty when caller isn't an inbox handler).
    const openInboxTickets: OpenInboxTicketLite[] = inboxTicketsRes.success
        ? (['open', 'in_progress', 'waiting_user'] as const).flatMap((s) =>
            inboxTicketsRes.data[s].map((t) => ({
                id: t.id,
                subject: t.subject,
                status: t.status,
                priority_level: t.meta.priority_level,
                due_date: t.meta.due_date,
                assignee_name: t.assignee_name,
                category_name_pl: t.category_name_pl,
            })),
        )
        : []

    return (
        <KontraktorzyHub
            dashboard={dashboard}
            conversations={conversations}
            contractors={contractors}
            entries={entries}
            departures={departures}
            tcmProfiles={tcmProfiles}
            contractorsLite={contractorsLite}
            onboardingQueue={onboardingQueue}
            exitQueue={exitQueue}
            tasks={tasks}
            openInboxTickets={openInboxTickets}
        />
    )
}
