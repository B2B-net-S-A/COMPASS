// Phase 37 — the old 5-tab Kontraktorzy hub is retired. Its content now lives in the unified
// modules: onboarding/exit → /internal/onboarding, conversations/roster + tasks → /internal/zgloszenia
// (Sprawy kontraktorskie), analytics → /internal/analityka. Contractor detail pages
// (/internal/kontraktorzy/[id]) are unchanged and still linked from the new hubs.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function KontraktorzyMovedPage() {
    redirect('/internal/onboarding')
}
