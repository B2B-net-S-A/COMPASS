// Phase 41 — daily reconciliation of substitute mail-forwarding rules.
//
// An Outlook inbox rule has no schedule of its own, so unlike OOF (where Exchange
// honours scheduledStart/EndDateTime) the window has to be opened and closed by us.
// That is what this module does, in three passes:
//
//   1. OPEN   — approved leaves with a substitute whose window is open but which have
//               no rule yet.
//   2. CLOSE  — rules belonging to leaves that ended or are no longer approved.
//   3. SWEEP  — rules found in mailboxes with no live leave behind them.
//
// Pass 3 is not belt-and-braces. Passes 1–2 work off `outlook_forward_rule_id`, so if
// that id is ever lost (failed write, restored backup, row deleted) the rule becomes
// invisible to us and keeps forwarding somebody's mail forever. The sweep is the only
// thing that catches that, which is why it scans mailboxes rather than rows.
//
// Soft-fail per item: one bad mailbox or leave never aborts the run.

import { logAudit } from '@/lib/actions/audit'
import {
    deleteForwardRule,
    listCompassForwardRules,
} from '@/lib/mailbox/graph-inbox-rules'
import { closeForwardRule, openForwardRule } from '@/lib/mailbox/forward-rule-sync'
import { logger } from '@/lib/logger'
import { shouldForwardBeActive, warsawToday } from './forward-window'
import { HR_ROLES } from './reconcile'

/**
 * Upper bound on mailboxes scanned per run, so a growing roster cannot push the cron
 * past its maxDuration. Comfortably above the current ~37; if it ever bites, the run
 * says so in `errors` rather than silently covering less ground.
 */
const MAX_SWEEP_PER_RUN = 100

export interface ForwardReconcileStats {
    /** Rules created because a leave's window opened. */
    opened: number
    /** Rules removed because a leave ended or stopped being approved. */
    closed: number
    /** Rules removed by the sweep — no live leave was behind them. */
    orphansRemoved: number
    /** Mailboxes actually inspected in pass 3. */
    sweptMailboxes: number
    errors: string[]
}

interface LeaveRow {
    id: string
    user_id: string
    substitute_id: string | null
    start_date: string
    end_date: string
    status: string
    outlook_forward_rule_id: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

async function emailFor(admin: Admin, userId: string): Promise<string | null> {
    const { data } = await admin
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle()
    return (data as { email: string | null } | null)?.email ?? null
}

/**
 * Reconcile every forwarding rule Compass is responsible for.
 * Service-role client (bypasses RLS).
 */
export async function reconcileForwardRules(admin: Admin): Promise<ForwardReconcileStats> {
    const stats: ForwardReconcileStats = {
        opened: 0,
        closed: 0,
        orphansRemoved: 0,
        sweptMailboxes: 0,
        errors: [],
    }

    const now = new Date()
    const today = warsawToday(now)

    // ─── Pass 1: open ────────────────────────────────────────────────────────
    // `start_date <= today` (not `=`) makes this self-healing: a leave whose rule was
    // never created — a skipped run, or a deploy landing mid-leave — still gets one on
    // the next run instead of going unforwarded for its whole duration.
    const { data: toOpenRaw, error: openErr } = await admin
        .from('leave_requests')
        .select('id, user_id, substitute_id, start_date, end_date, status, outlook_forward_rule_id')
        .eq('status', 'approved')
        .not('substitute_id', 'is', null)
        .is('outlook_forward_rule_id', null)
        .lte('start_date', today)
        .gte('end_date', today)
    if (openErr) {
        stats.errors.push(`open query: ${openErr.message}`)
    }

    for (const leave of (toOpenRaw ?? []) as LeaveRow[]) {
        try {
            const [userEmail, substitute] = await Promise.all([
                emailFor(admin, leave.user_id),
                admin
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', leave.substitute_id)
                    .maybeSingle(),
            ])
            const sub = (substitute as { data: { full_name: string | null; email: string } | null })
                .data
            if (!userEmail || !sub?.email) {
                stats.errors.push(`${leave.id}: brak emaila pracownika lub zastępcy`)
                continue
            }
            const ok = await openForwardRule({
                admin,
                leaveId: leave.id,
                userEmail,
                substituteEmail: sub.email,
                substituteName: sub.full_name ?? sub.email,
                actorUserId: null, // system
                targetUserId: leave.user_id,
                auditExtra: { via: 'cron' },
            })
            if (ok) stats.opened++
        } catch (e) {
            stats.errors.push(`${leave.id}: open ${e instanceof Error ? e.message : 'unknown'}`)
        }
    }

    // ─── Pass 2: close ───────────────────────────────────────────────────────
    const { data: toCloseRaw, error: closeErr } = await admin
        .from('leave_requests')
        .select('id, user_id, substitute_id, start_date, end_date, status, outlook_forward_rule_id')
        .not('outlook_forward_rule_id', 'is', null)
    if (closeErr) {
        stats.errors.push(`close query: ${closeErr.message}`)
    }

    for (const leave of (toCloseRaw ?? []) as LeaveRow[]) {
        // Re-use the single source of truth rather than re-deriving the condition:
        // anything that should no longer be forwarding gets torn down here.
        if (
            shouldForwardBeActive(
                {
                    status: leave.status,
                    substituteId: leave.substitute_id,
                    startDate: leave.start_date,
                    endDate: leave.end_date,
                },
                now,
            )
        ) {
            continue
        }
        try {
            const userEmail = await emailFor(admin, leave.user_id)
            if (!userEmail) {
                stats.errors.push(`${leave.id}: brak emaila pracownika przy zamykaniu`)
                continue
            }
            const ok = await closeForwardRule({
                admin,
                leaveId: leave.id,
                ruleId: leave.outlook_forward_rule_id as string,
                userEmail,
                actorUserId: null, // system
                reason: leave.status === 'approved' ? 'leave_ended' : 'not_approved',
                auditExtra: { via: 'cron', target_user_id: leave.user_id },
            })
            if (ok) stats.closed++
        } catch (e) {
            stats.errors.push(`${leave.id}: close ${e instanceof Error ? e.message : 'unknown'}`)
        }
    }

    // ─── Pass 3: orphan sweep ────────────────────────────────────────────────
    // Built AFTER passes 1-2 so rules created moments ago count as legitimate.
    const { data: liveRaw } = await admin
        .from('leave_requests')
        .select('id, user_id, substitute_id, start_date, end_date, status, outlook_forward_rule_id')
        .not('outlook_forward_rule_id', 'is', null)

    const legitRuleByLeave = new Map<string, string>()
    for (const leave of (liveRaw ?? []) as LeaveRow[]) {
        if (
            leave.outlook_forward_rule_id &&
            shouldForwardBeActive(
                {
                    status: leave.status,
                    substituteId: leave.substitute_id,
                    startDate: leave.start_date,
                    endDate: leave.end_date,
                },
                now,
            )
        ) {
            legitRuleByLeave.set(leave.id, leave.outlook_forward_rule_id)
        }
    }

    const { data: rosterRaw, error: rosterErr } = await admin
        .from('profiles')
        .select('id, email, employment_status')
        .in('role', [...HR_ROLES])
    if (rosterErr) {
        stats.errors.push(`roster: ${rosterErr.message}`)
        logger.info({ event: 'forward_rules.reconcile.done', ...stats })
        return stats
    }

    // Filter exited/offboarding + missing email in JS (PostgREST NULL-in-NOT-IN pitfall).
    const roster = ((rosterRaw ?? []) as Array<{
        id: string
        email: string | null
        employment_status: string | null
    }>).filter(
        (u) => u.email && u.employment_status !== 'exited' && u.employment_status !== 'offboarding',
    )

    if (roster.length > MAX_SWEEP_PER_RUN) {
        stats.errors.push(
            `sweep capped: ${roster.length} skrzynek > limit ${MAX_SWEEP_PER_RUN} — reszta pominięta w tym przebiegu`,
        )
    }

    for (const u of roster.slice(0, MAX_SWEEP_PER_RUN)) {
        const email = u.email as string
        const rules = await listCompassForwardRules(email)
        // null = we could not read the mailbox. "Unknown" must not be treated as
        // "nothing to clean up", so skip rather than assume.
        if (rules === null) {
            stats.errors.push(`${email}: nie odczytano reguł skrzynki`)
            continue
        }
        stats.sweptMailboxes++

        for (const rule of rules) {
            if (legitRuleByLeave.get(rule.leaveId) === rule.id) continue

            const res = await deleteForwardRule({ userEmail: email, ruleId: rule.id })
            if (!res.success) {
                stats.errors.push(`${email}: nie usunięto osieroconej reguły ${rule.id}`)
                continue
            }
            if (res.skipped) continue

            stats.orphansRemoved++
            // Defensive: if some row still points at the rule we just deleted, forget it
            // so the next run does not try to delete it again.
            await admin
                .from('leave_requests')
                .update({ outlook_forward_rule_id: null } as never)
                .eq('outlook_forward_rule_id', rule.id)
            await logAudit(null, 'LEAVE_FORWARD_ORPHAN_REMOVED', {
                leave_id: rule.leaveId,
                mailbox: email,
                rule_id: rule.id,
            })
        }
    }

    logger.info({
        event: 'forward_rules.reconcile.done',
        ...stats,
        errorCount: stats.errors.length,
    })
    return stats
}
