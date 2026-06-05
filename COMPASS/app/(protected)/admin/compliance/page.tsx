// Phase 37 — Compliance admin dashboard removed from the UI per product decision.
// The consent data (um_legal_documents / um_user_consents) and the login-gating actions in
// lib/actions/compliance.ts are intentionally KEPT (GDPR audit trail). This route now just
// redirects away so old links/bookmarks don't 404.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ComplianceRemovedPage() {
    redirect('/home')
}
