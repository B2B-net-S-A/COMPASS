// Phase 37 — Onboarding & Exit hub (TCM + admin): employees + contractors in one module.

import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'
import { listOnboardingQueue as listEmployeeOnboardingQueue } from '@/lib/actions/lifecycle'
import {
    listOnboardingQueue as listContractorOnboardingQueue,
    listExitInterviewQueue,
    listEntries,
} from '@/lib/actions/contractors'
import { OnboardingHub } from '@/components/internal/onboarding/OnboardingHub'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
    await requireTalentCommunityOrAdminLayout()

    const [employeeOnboarding, contractorOnboarding, contractorExit, entries] = await Promise.all([
        listEmployeeOnboardingQueue({ status: 'in_progress' }),
        listContractorOnboardingQueue(),
        listExitInterviewQueue(),
        listEntries(),
    ])

    return (
        <OnboardingHub
            employeeOnboarding={employeeOnboarding}
            contractorOnboarding={contractorOnboarding}
            contractorExit={contractorExit}
            entries={entries}
        />
    )
}
