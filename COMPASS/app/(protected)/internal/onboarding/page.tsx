// Phase 38 — the merged Onboarding & Exit hub is retired. Contractor onboarding now lives as a tab
// in the Talent Community / Kontraktorzy hub; internal-employee onboarding stays at /internal/lifecycle
// (reachable via the "Pracownicy wewnętrzni" sidebar group).

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function OnboardingMovedPage() {
    redirect('/internal/kontraktorzy?tab=onboarding')
}
