// Phase 33 — Kontraktorzy hub (TCM + admin). Loads data server-side, renders the client hub.

import {
    listContractors, listConversations, listEntries, listDepartures,
    getContractorDashboard, listTcmProfiles,
} from '@/lib/actions/contractors'
import { KontraktorzyHub } from '@/components/internal/kontraktorzy/KontraktorzyHub'

export const dynamic = 'force-dynamic'

export default async function KontraktorzyPage() {
    const [dashboard, conversations, contractors, entries, departures, tcmProfiles] = await Promise.all([
        getContractorDashboard(),
        listConversations({ limit: 800 }),
        listContractors(),
        listEntries(),
        listDepartures(),
        listTcmProfiles(),
    ])

    const contractorsLite = contractors.map((c) => ({ id: c.id, full_name: c.full_name }))

    return (
        <KontraktorzyHub
            dashboard={dashboard}
            conversations={conversations}
            contractors={contractors}
            entries={entries}
            departures={departures}
            tcmProfiles={tcmProfiles}
            contractorsLite={contractorsLite}
        />
    )
}
