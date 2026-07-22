import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { withCronAuth } from '@/lib/api/with-auth'
import { logger } from '@/lib/logger'
import { reconcileForwardRules } from '@/lib/oof/forward-rules'
import { reconcileOutlookOof } from '@/lib/oof/reconcile'

export const dynamic = 'force-dynamic'
// Phase 41 raised this from 120: the forwarding half adds a per-mailbox rule listing
// on top of the per-mailbox OOF read, and create/delete carry a 3-attempt backoff.
export const maxDuration = 240

/**
 * Phase 36 — reverse Outlook OOF → Compass sync.
 * Phase 41 — substitute mail-forwarding rules.
 *
 * Two independent jobs sharing one schedule because they cover the same ground
 * (every HR-zone mailbox, once a day) and neither warrants its own Coolify entry.
 *
 * OOF half: scans every HR-zone mailbox's Out-of-Office and creates PENDING vacation
 * leave_requests (source='outlook_oof') for absences the employee set in Outlook but
 * never filed in COMPASS. They land in the normal approval queue. Compass-managed
 * OOFs are skipped; days already covered by an approved/pending leave (or a
 * previously rejected outlook_oof request) are not re-created.
 *
 * Forwarding half: opens/closes the inbox rules that forward mail to a substitute,
 * and sweeps rules with no live leave behind them. Inbox rules never expire on their
 * own, so this is what keeps forwarding from outliving the leave.
 *
 * Auth: Bearer $CRON_SECRET (see withCronAuth).
 *
 * Coolify schedule: `0 6 * * *`
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://compass.dynaminds.pl/api/cron/oof-reconcile"
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    // Each half runs in its own try/catch: a forwarding bug must not take down the OOF
    // reconcile, or vice versa. Before Phase 41 this route had no try/catch at all, so
    // any throw surfaced as a bare 500 with nothing in Sentry.
    //
    // Forward runs FIRST (Phase 41b). The OOF half reads ~37 mailboxes sequentially with
    // no per-call timeout; if any of them hangs, it can burn the whole maxDuration budget
    // and the runtime kills the request before the forward half ever executes — which
    // leaves forwarding rules stuck open with nothing in the DB to show for it. Ordering
    // forwarding first guarantees it gets its turn. It is also the cheaper half (a rule
    // listing per mailbox, DB-bounded), so it finishes fast and leaves the rest of the
    // budget to OOF.
    let forwardStats: Awaited<ReturnType<typeof reconcileForwardRules>> | null = null
    let forwardError: string | null = null
    try {
        forwardStats = await reconcileForwardRules(admin as never)
    } catch (e) {
        forwardError = e instanceof Error ? e.message : 'unknown'
        logger.error({ event: 'forward_rules.reconcile.crashed', error: forwardError })
        Sentry.captureException(e, { tags: { kind: 'cron_forward_rules' } })
    }

    let oofStats: Awaited<ReturnType<typeof reconcileOutlookOof>> | null = null
    let oofError: string | null = null
    try {
        oofStats = await reconcileOutlookOof(admin as never)
    } catch (e) {
        oofError = e instanceof Error ? e.message : 'unknown'
        logger.error({ event: 'oof.reconcile.crashed', error: oofError })
        Sentry.captureException(e, { tags: { kind: 'cron_oof_reconcile' } })
    }

    // Two different thresholds on purpose:
    //   `ok`     — did anything crash? Monitoring reads this, so a half that died must
    //              never report success (Phase 36 returned ok:true unconditionally and
    //              relied on a 500 to signal trouble; keep that strictness).
    //   Sentry   — only when the WHOLE run collapsed. Across ~37 mailboxes a single
    //              unreadable one is routine, and paging on it teaches people to ignore
    //              Sentry.
    const anyDown = Boolean(oofError || forwardError)
    const bothDown = Boolean(oofError && forwardError)
    if (bothDown) {
        Sentry.captureMessage('oof_reconcile_run_failed', {
            level: 'warning',
            tags: { kind: 'cron_oof_reconcile' },
            extra: { oofError, forwardError },
        })
    }

    return NextResponse.json({
        ok: !anyDown,
        // Phase 36 response shape preserved at the top level so existing checks keep working.
        ...(oofStats ?? {}),
        errors: oofStats ? oofStats.errors.slice(0, 15) : [oofError ?? 'oof: unknown'],
        forward: forwardStats
            ? { ...forwardStats, errors: forwardStats.errors.slice(0, 15) }
            : { error: forwardError ?? 'unknown' },
    })
})
