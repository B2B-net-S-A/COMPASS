// Phase 38 — Talent Community / Kontraktorzy hub: five contractor-lifecycle elements. Four render
// here as tabs (Rozmowy / Onboarding / Exit / Kontraktorzy); Analityka is its own route. Contractor
// detail pages (/internal/kontraktorzy/[id]) are linked from the tables.

import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'
import {
    listConversations,
    listOnboardingEntries,
    listExitDepartures,
    listContractorRoster,
    listBench,
    listTcmProfiles,
    listContractors,
} from '@/lib/actions/contractors'
import { KontraktorzyHub } from '@/components/internal/kontraktorzy/KontraktorzyHub'

export const dynamic = 'force-dynamic'

export default async function KontraktorzyPage() {
    await requireTalentCommunityOrAdminLayout()

    const [conversations, onboardingEntries, departures, bench, roster, tcmProfiles, contractors] = await Promise.all([
        listConversations({ limit: 800 }),
        listOnboardingEntries(),
        listExitDepartures(),
        listBench(),
        listContractorRoster(),
        listTcmProfiles(),
        listContractors(),
    ])
    const contractorsLite = contractors.map((c) => ({ id: c.id, full_name: c.full_name }))

    return (
        <KontraktorzyHub
            conversations={conversations}
            onboardingEntries={onboardingEntries}
            departures={departures}
            bench={bench}
            roster={roster}
            tcmProfiles={tcmProfiles}
            contractorsLite={contractorsLite}
        />
    )
}
