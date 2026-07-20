// Phase 36 — reverse Outlook OOF → Compass sync (orchestrator).
//
// Scans every HR-zone mailbox's Out-of-Office via Graph. For OOFs the user set
// themselves (no Compass marker) that are NOT already covered by an approved/pending
// leave, creates a PENDING vacation leave_request (source='outlook_oof') for each
// missing working-day run, so a manager/admin can approve or reject it from the
// normal leave queue. Compass-managed OOFs are skipped (they already mirror a leave).
//
// Direction A (Compass → Outlook, Phase 25) pushes leaves into Outlook. This is the
// reverse direction: detect-and-surface, human-in-the-loop. We never auto-approve —
// the pending request respects manager approval, pool accounting and substitute flow.

import { getCurrentOof } from '@/lib/mailbox/graph-oof'
import {
    VACATION_POOL_TYPES,
    computePaidUnpaidSplit,
    totalVacationDaysUsed,
    workingDaysInLeave,
    type LeaveSpan,
} from '@/lib/hr/leave-balance'
import type { PublicHolidayDate } from '@/lib/hr/working-days'
import { computeMissingRuns, oofScheduledToDates, type OofDateRange } from './oof-dates'
import { logger } from '@/lib/logger'

const COMPASS_OOF_MARKER = 'compass-managed-oof-v1'
/** Roles whose mailboxes Compass touches. Shared with the Phase 41 forwarding sweep. */
export const HR_ROLES = ['internal', 'manager', 'finanse', 'talent_community', 'admin'] as const
const OOF_SOURCE = 'outlook_oof'

export interface OofReconcileStats {
    /** Mailboxes scanned. */
    scanned: number
    /** Mailboxes with an active (non-disabled) auto-reply. */
    activeOof: number
    /** Active OOFs Compass itself set (marker present) — skipped. */
    compassOof: number
    /** Active OOFs the user set themselves — candidates for reconciliation. */
    userOof: number
    /** Missing working-day runs detected across all users. */
    gapsFound: number
    /** Pending leave_requests created this run. */
    created: number
    errors: string[]
}

interface ProfileRow {
    id: string
    email: string | null
    full_name: string | null
    employment_type: string | null
    employment_status: string | null
    leave_entitlement_days: number | null
    leave_carried_over_days: number | string | null
    leave_used_initial_days: number | string | null
}

/**
 * Scan all HR-zone mailboxes and create pending leave_requests for OOF gaps.
 * Service-role client (bypasses RLS). Soft-fail per user — one bad mailbox never
 * aborts the whole run; problems land in `stats.errors`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reconcileOutlookOof(admin: any): Promise<OofReconcileStats> {
    const stats: OofReconcileStats = {
        scanned: 0,
        activeOof: 0,
        compassOof: 0,
        userOof: 0,
        gapsFound: 0,
        created: 0,
        errors: [],
    }

    const { data: rosterRaw, error: rosterErr } = await admin
        .from('profiles')
        .select(
            'id, email, full_name, employment_type, employment_status, leave_entitlement_days, leave_carried_over_days, leave_used_initial_days',
        )
        .in('role', [...HR_ROLES])
    if (rosterErr) {
        stats.errors.push(`roster: ${rosterErr.message}`)
        return stats
    }
    // Filter exited/offboarding + missing email in JS (avoids PostgREST NULL-in-NOT-IN pitfall).
    const roster = ((rosterRaw ?? []) as ProfileRow[]).filter(
        (u) => u.email && u.employment_status !== 'exited' && u.employment_status !== 'offboarding',
    )

    // leave_requests.created_by is NOT NULL → use a system actor (env override or first admin).
    let actorId = process.env.OOF_RECONCILE_ACTOR_ID ?? ''
    if (!actorId) {
        const { data: adminRow } = await admin
            .from('profiles')
            .select('id')
            .eq('role', 'admin')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        actorId = (adminRow as { id: string } | null)?.id ?? ''
    }
    if (!actorId) {
        stats.errors.push('no system actor (set OOF_RECONCILE_ACTOR_ID or create an admin profile)')
        return stats
    }

    for (const u of roster) {
        stats.scanned++
        const email = u.email as string
        let oof
        try {
            oof = await getCurrentOof(email)
        } catch {
            stats.errors.push(`${email}: getCurrentOof failed`)
            continue
        }
        if (!oof || oof.status === 'disabled') continue
        stats.activeOof++

        const body = `${oof.internalReplyMessage ?? ''}${oof.externalReplyMessage ?? ''}`
        if (body.includes(COMPASS_OOF_MARKER)) {
            stats.compassOof++
            continue
        }
        stats.userOof++

        if (oof.status !== 'scheduled' || !oof.scheduledStartDateTime || !oof.scheduledEndDateTime) {
            // alwaysEnabled / no dates → can't infer a range. Flag, don't guess.
            stats.errors.push(`${email}: OOF status='${oof.status}' bez dat — pominięto (wymaga ręcznego wpisu)`)
            continue
        }
        const range = oofScheduledToDates(oof.scheduledStartDateTime, oof.scheduledEndDateTime)
        if (!range) {
            stats.errors.push(`${email}: nie sparsowano zakresu OOF`)
            continue
        }

        try {
            stats.created += await processUserOof(admin, u, range, actorId, stats)
        } catch (e) {
            stats.errors.push(`${email}: ${e instanceof Error ? e.message : 'unknown'}`)
        }
    }

    logger.info({ event: 'oof.reconcile.done', ...stats, errorCount: stats.errors.length })
    return stats
}

async function processUserOof(
    admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    u: ProfileRow,
    range: OofDateRange,
    actorId: string,
    stats: OofReconcileStats,
): Promise<number> {
    // Existing leaves overlapping the OOF range that count as "covered":
    //   approved/pending (any type)        → person already accounted for
    //   rejected + source=outlook_oof      → manager already declined this auto-request;
    //                                         don't recreate (otherwise infinite re-flag loop)
    const { data: leavesRaw } = await admin
        .from('leave_requests')
        .select('start_date, end_date, half_day, leave_type, status, source')
        .eq('user_id', u.id)
        .gte('end_date', range.startDate)
        .lte('start_date', range.endDate)
    const leaves = (leavesRaw ?? []) as Array<LeaveSpan & { status: string; source: string | null }>
    const coveredSpans: LeaveSpan[] = leaves
        .filter(
            (l) =>
                l.status === 'approved' ||
                l.status === 'pending' ||
                (l.status === 'rejected' && l.source === OOF_SOURCE),
        )
        .map((l) => ({
            start_date: l.start_date,
            end_date: l.end_date,
            half_day: l.half_day,
            leave_type: l.leave_type,
        }))

    const { data: holRange } = await admin
        .from('public_holidays')
        .select('date, name_pl')
        .gte('date', range.startDate)
        .lte('date', range.endDate)
    const holidays = (holRange ?? []) as PublicHolidayDate[]

    const runs = computeMissingRuns(range, coveredSpans, holidays)
    stats.gapsFound += runs.length
    if (runs.length === 0) return 0

    let created = 0
    for (const run of runs) {
        const yr = run.startDate.slice(0, 4)
        // Re-query pool usage per run so multiple runs in the same pass account for
        // the pending rows we just inserted.
        const [{ data: poolRows }, { data: yrHolRows }] = await Promise.all([
            admin
                .from('leave_requests')
                .select('start_date, end_date, half_day, leave_type')
                .eq('user_id', u.id)
                .in('status', ['approved', 'pending'])
                .in('leave_type', [...VACATION_POOL_TYPES])
                .gte('start_date', `${yr}-01-01`)
                .lte('start_date', `${yr}-12-31`),
            admin
                .from('public_holidays')
                .select('date, name_pl')
                .gte('date', `${yr}-01-01`)
                .lte('date', `${yr}-12-31`),
        ])
        const yrHolidays = (yrHolRows ?? []) as PublicHolidayDate[]
        const alreadyBooked = totalVacationDaysUsed((poolRows ?? []) as LeaveSpan[], yrHolidays)
        const workingDays = workingDaysInLeave(
            { start_date: run.startDate, end_date: run.endDate, half_day: null, leave_type: 'vacation' },
            yrHolidays,
        )
        const split = computePaidUnpaidSplit({
            employmentType: u.employment_type,
            entitlementDays: u.leave_entitlement_days,
            carriedOverDays: Number(u.leave_carried_over_days ?? 0),
            usedInitialDays: Number(u.leave_used_initial_days ?? 0),
            alreadyBookedDaysInYear: alreadyBooked,
            requestedWorkingDays: workingDays,
        })

        const note =
            `Auto-wykryte z Outlook OOF: pracownik ustawił nieobecność ${range.startDate}–${range.endDate} ` +
            `w Outlooku bez wniosku w COMPASS. Zweryfikuj i zatwierdź lub odrzuć.`

        const { error: insErr } = await admin.from('leave_requests').insert({
            user_id: u.id,
            start_date: run.startDate,
            end_date: run.endDate,
            leave_type: 'vacation',
            half_day: null,
            note,
            status: 'pending',
            created_by: actorId,
            created_on_behalf: true,
            paid_days: split.paid,
            unpaid_days: split.unpaid,
            source: OOF_SOURCE,
        } as never)
        if (insErr) {
            stats.errors.push(`${u.email} ${run.startDate}–${run.endDate}: insert ${insErr.message}`)
            continue
        }
        created++
        logger.info({
            event: 'oof.reconcile.created',
            user_id: u.id,
            start: run.startDate,
            end: run.endDate,
            paid: split.paid,
            unpaid: split.unpaid,
        })
    }
    return created
}
