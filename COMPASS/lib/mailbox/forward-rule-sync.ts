// Phase 41 — persistence layer for substitute mail-forwarding rules.
//
// Sits between the raw Graph calls (graph-inbox-rules.ts) and the two callers that
// need them: the leave server actions (approve / cancel / edit / retry) and the daily
// cron. Keeping it here rather than in internal-leave.ts means the cron does not have
// to import a 'use server' module just to reuse the audit + column bookkeeping.
//
// Mirrors persistOofResult in internal-leave.ts, including the `graph_sync_error`
// prefix convention ('oof: ' / 'calendar: ' / 'forward: ') that the admin
// sync-issues queue and the retry button already key off.

import type { SupabaseClient } from '@supabase/supabase-js'
// Audyt 2026-08 (A3.2): polityka INSERT na audit_logs wymaga teraz
// auth.uid() = user_id. Ten moduł pisze audyt również z `actorUserId: null`
// („system" — przebieg reconcile/samoleczenia) oraz spoza żądania crona
// (maybeSelfHealForwardRules odpala się przy renderze kolejki wniosków pod
// sesją admina). W obu przypadkach logAudit klientem cookie odbiłby się o RLS,
// a przy heartbeacie FORWARD_RECONCILE_RUN cichy brak wpisu zdejmuje zamek
// chroniący przed pełnym skanem ~37 skrzynek Graph przy każdym wejściu na ekran.
// Moduł nie ma 'use server', więc zapis service-rolą nie jest wołalny z klienta.
import { logSystemAudit } from '@/lib/audit/system-log'
import { createForwardRule, deleteForwardRule } from '@/lib/mailbox/graph-inbox-rules'
import type { Database } from '@/lib/supabase/database.types'

type Admin = SupabaseClient<Database>

export interface OpenForwardRuleArgs {
    admin: Admin
    leaveId: string
    /** Mailbox whose incoming mail gets forwarded (the person on leave). */
    userEmail: string
    substituteEmail: string
    substituteName?: string | null
    actorUserId: string | null
    targetUserId: string
    auditExtra?: Record<string, unknown>
}

/**
 * Create the rule and record its id on the leave row.
 *
 * Returns true only when a rule now exists and we know how to delete it. A rule we
 * cannot address is worse than no rule at all, so a missing id counts as failure and
 * leaves the orphan sweep to clean up.
 */
export async function openForwardRule(args: OpenForwardRuleArgs): Promise<boolean> {
    const { admin, leaveId, userEmail, substituteEmail, substituteName } = args
    const { actorUserId, targetUserId, auditExtra } = args

    const result = await createForwardRule({
        userEmail,
        substituteEmail,
        substituteName,
        leaveId,
    })

    if (result.skipped) return false // no credentials (dev/local) — stay silent

    if (result.success && result.ruleId) {
        await admin
            .from('leave_requests')
            .update({ outlook_forward_rule_id: result.ruleId } as never)
            .eq('id', leaveId)
        await logSystemAudit(actorUserId, 'LEAVE_FORWARD_SET', {
            leave_id: leaveId,
            target_user_id: targetUserId,
            substitute_email: substituteEmail,
            ...auditExtra,
        })
        return true
    }

    await admin
        .from('leave_requests')
        .update({ graph_sync_error: `forward: ${result.error}` } as never)
        .eq('id', leaveId)
    await logSystemAudit(actorUserId, 'LEAVE_FORWARD_FAILED', {
        leave_id: leaveId,
        target_user_id: targetUserId,
        error: result.error,
        stage: 'create',
        ...auditExtra,
    })
    return false
}

export interface CloseForwardRuleArgs {
    admin: Admin
    leaveId: string
    ruleId: string
    userEmail: string
    actorUserId: string | null
    /**
     * Why the rule is going away — ends up in the audit log.
     * `opted_out` is Phase 41c: the employee (or their manager) switched forwarding
     * off by hand, as opposed to the leave simply running its course.
     */
    reason:
        | 'leave_ended'
        | 'cancelled'
        | 'edited'
        | 'not_approved'
        | 'retry_recreate'
        | 'opted_out'
    auditExtra?: Record<string, unknown>
}

/**
 * Delete the rule and forget its id.
 *
 * The column is cleared ONLY when Graph confirms the rule is gone (404 counts as
 * gone — the employee may have deleted it themselves). Clearing it on failure would
 * strand a live forwarding rule with nothing pointing at it; the orphan sweep would
 * eventually find it, but until then somebody's mail keeps flowing to a colleague.
 */
export async function closeForwardRule(args: CloseForwardRuleArgs): Promise<boolean> {
    const { admin, leaveId, ruleId, userEmail, actorUserId, reason, auditExtra } = args

    const result = await deleteForwardRule({ userEmail, ruleId })

    if (result.skipped) return false

    if (!result.success) {
        await admin
            .from('leave_requests')
            .update({ graph_sync_error: `forward: ${result.error}` } as never)
            .eq('id', leaveId)
        await logSystemAudit(actorUserId, 'LEAVE_FORWARD_FAILED', {
            leave_id: leaveId,
            error: result.error,
            stage: 'delete',
            reason,
            ...auditExtra,
        })
        return false
    }

    await admin
        .from('leave_requests')
        .update({ outlook_forward_rule_id: null } as never)
        .eq('id', leaveId)
    await logSystemAudit(actorUserId, 'LEAVE_FORWARD_DISABLED', {
        leave_id: leaveId,
        reason,
        ...auditExtra,
    })
    return true
}
