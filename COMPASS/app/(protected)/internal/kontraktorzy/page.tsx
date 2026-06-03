// Phase 33/34 — Kontraktorzy hub (TCM + admin). Loads data server-side, renders the journey-staged hub.

import {
    listContractors, listConversations, listEntries, listDepartures,
    getContractorDashboard, listTcmProfiles,
    listOnboardingQueue, listExitInterviewQueue, listTasks,
} from '@/lib/actions/contractors'
import { getInboxSummary } from '@/lib/actions/support-inbox'
import { KontraktorzyHub } from '@/components/internal/kontraktorzy/KontraktorzyHub'

export const dynamic = 'force-dynamic'

export default async function KontraktorzyPage() {
    const [
        dashboard, conversations, contractors, entries, departures, tcmProfiles,
        onboardingQueue, exitQueue, tasks, inboxRes,
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
        getInboxSummary(),
    ])

    const contractorsLite = contractors.map((c) => ({ id: c.id, full_name: c.full_name }))
    const inboxSummary = inboxRes.success ? inboxRes.data : null

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
            inboxSummary={inboxSummary}
        />
    )
}
