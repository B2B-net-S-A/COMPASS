import { NextResponse } from 'next/server'
import { withCronAuth } from '@/lib/api/with-auth'
import { reconcileOutlookOof } from '@/lib/oof/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Phase 36 — reverse Outlook OOF → Compass sync.
 *
 * Scans every HR-zone mailbox's Out-of-Office and creates PENDING vacation
 * leave_requests (source='outlook_oof') for absences the employee set in Outlook
 * but never filed in COMPASS. They land in the normal approval queue for a
 * manager/admin to approve or reject. Compass-managed OOFs (own auto-replies) are
 * skipped; days already covered by an approved/pending leave (or a previously
 * rejected outlook_oof request) are not re-created.
 *
 * Auth: Bearer $CRON_SECRET (see withCronAuth).
 *
 * Coolify schedule: `0 6 * * *`
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://compass.dynaminds.pl/api/cron/oof-reconcile"
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    const stats = await reconcileOutlookOof(admin)
    return NextResponse.json({ ok: true, ...stats, errors: stats.errors.slice(0, 15) })
})
