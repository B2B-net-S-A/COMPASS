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

import {
    compassOofBlocksNewLeave,
    compassOofMatchesLeave,
    readCurrentOof,
    setOutOfOffice,
    shouldPreserveUserOof,
    type CurrentOofState,
} from '@/lib/mailbox/graph-oof'
import { buildOofDefaultsForLeave } from '@/lib/mailbox/oof-defaults'
import { shouldSetOofForLeave } from '@/lib/mailbox/oof-template'
import { logSystemAudit } from '@/lib/audit/system-log'
import { warsawToday, warsawTomorrow } from './forward-window'
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
import { activeRoster } from '@/lib/hr/employment-window'

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
    /**
     * Audyt 2026-09-22, INT-08 — skrzynki, których OOF NIE udało się odczytać.
     * `readErrors === scanned` (przy scanned > 0) = cały przebieg ślepy; trasa
     * zwraca wtedy `ok:false`, zamiast udawać „0 nieobecności".
     */
    readErrors: number
    /** INT-02 — OOF COMPASS ustawione przez cron dla urlopów odroczonych przy akceptacji. */
    deferredOofSet: number
    errors: string[]
}

interface DueLeaveRow {
    id: string
    user_id: string
    start_date: string
    end_date: string
    half_day: 'morning' | 'afternoon' | null
    substitute_id: string | null
    graph_oof_set: boolean | null
    graph_oof_skip_reason: string | null
    oof_internal_message: string | null
    oof_external_message: string | null
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
        readErrors: 0,
        deferredOofSet: 0,
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
    // Filtrowanie w JS, nie w PostgREST (pułapka NULL-in-NOT-IN).
// Audyt 2026-08 (B4): NIE wykluczamy `offboarding`. Ta osoba do ostatniego dnia
// normalnie pracuje i normalnie bierze urlop — self-service createLeaveRequest
// jej nie blokuje, a lib/auth/employment-access.ts:20 mówi wprost, że offboarding
// nie odbiera dostępu. Wykluczenie jej stąd znaczyło, że wniosek urlopowy
// przechodzi, ale COMPASS nie ustawi jej Out-of-Office ani nie przekieruje poczty
// do zastępcy — czyli dokładnie w okresie, gdy przekazanie obowiązków jest
// najważniejsze. Odcina dopiero `exited` (Phase 43).
    const roster = activeRoster((rosterRaw ?? []) as ProfileRow[])
        .filter((u) => u.email)

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

    const dueByUser = await loadDueCompassLeaves(admin, stats)

    for (const u of roster) {
        stats.scanned++
        const email = u.email as string
        // INT-08: błąd odczytu jest liczony i raportowany, a nie mylony z „brak OOF".
        const read = await readCurrentOof(email)
        if (!read.ok) {
            stats.readErrors++
            stats.errors.push(`${email}: odczyt OOF nieudany (${read.statusCode ?? read.error})`)
            continue
        }
        const oof = read.state

        const due = dueByUser.get(u.id)
        if (due) {
            try {
                await applyDueCompassOof(admin, u, due, oof, stats)
            } catch (e) {
                stats.errors.push(`${email}: odroczony OOF — ${e instanceof Error ? e.message : 'unknown'}`)
            }
        }

        if (oof.status === 'disabled') continue
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

/**
 * INT-02 — zatwierdzone urlopy, które DZIŚ albo JUTRO powinny mieć OOF COMPASS,
 * a COMPASS nigdy go nie ustawił (`graph_oof_set=false`). Tak kończy urlop
 * odroczony przy akceptacji (`skipReason: 'compass_active'`, bo trwał inny)
 * oraz taki, którego ustawienie padło. Jeden na osobę: najwcześniej zaczynający się.
 *
 * Świadomie tylko `graph_oof_set=false`: gdy COMPASS już raz ustawił OOF,
 * a pracownik sam go wyłączył (np. wrócił wcześniej), cron nie włącza go na nowo.
 * `user_custom` też pomijamy — to decyzja o zachowaniu własnej odpowiedzi.
 */
async function loadDueCompassLeaves(
    admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    stats: OofReconcileStats,
    now: Date = new Date(),
): Promise<Map<string, DueLeaveRow>> {
    const out = new Map<string, DueLeaveRow>()
    const { data, error } = await admin
        .from('leave_requests')
        .select(
            'id, user_id, start_date, end_date, half_day, substitute_id, graph_oof_set, graph_oof_skip_reason, oof_internal_message, oof_external_message',
        )
        .eq('status', 'approved')
        .eq('graph_oof_set', false)
        .lte('start_date', warsawTomorrow(now))
        .gte('end_date', warsawToday(now))
    if (error) {
        stats.errors.push(`odroczone OOF: odczyt urlopów nieudany (${error.message})`)
        return out
    }
    for (const row of (data ?? []) as DueLeaveRow[]) {
        if (row.graph_oof_skip_reason === 'user_custom') continue
        if (!shouldSetOofForLeave({ startDate: row.start_date, endDate: row.end_date, halfDay: row.half_day })) continue
        const prev = out.get(row.user_id)
        if (!prev || row.start_date < prev.start_date) out.set(row.user_id, row)
    }
    return out
}

/** INT-02 — ustaw odroczony OOF COMPASS, jeśli skrzynka jest na niego gotowa. */
async function applyDueCompassOof(
    admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    u: ProfileRow,
    leave: DueLeaveRow,
    current: CurrentOofState,
    stats: OofReconcileStats,
): Promise<void> {
    const markSet = async () => {
        const { error } = await admin
            .from('leave_requests')
            .update({
                graph_oof_set: true,
                graph_oof_set_at: new Date().toISOString(),
                graph_oof_skip_reason: null,
            })
            .eq('id', leave.id)
        if (error) stats.errors.push(`${u.email}: zapis graph_oof_set nieudany (${error.message})`)
    }

    // Skrzynka ma już dokładnie ten OOF (np. ustawiony, ale flaga się nie zapisała).
    if (compassOofMatchesLeave(current, leave.start_date, leave.end_date)) {
        await markSet()
        return
    }
    // Własna odpowiedź pracownika albo nadal trwający wcześniejszy urlop — czekamy.
    if (shouldPreserveUserOof(current) || compassOofBlocksNewLeave(current, leave.start_date)) return

    const defaults = await buildOofDefaultsForLeave({
        admin,
        userId: u.id,
        employeeName: u.full_name ?? (u.email as string),
        endDate: leave.end_date,
        substituteId: leave.substitute_id,
    })
    const result = await setOutOfOffice({
        userEmail: u.email as string,
        startDate: leave.start_date,
        endDate: leave.end_date,
        internalReply: leave.oof_internal_message?.trim() || defaults.internal,
        externalReply: leave.oof_external_message?.trim() || defaults.external,
    })
    if (result.success && !result.skipped) {
        await markSet()
        stats.deferredOofSet++
        await logSystemAudit(null, 'LEAVE_OOF_SET', {
            leave_id: leave.id,
            target_user_id: u.id,
            via: 'oof_reconcile',
        })
        logger.info({ event: 'oof.reconcile.deferred_set', leave_id: leave.id, user_id: u.id })
        return
    }
    if (!result.success) {
        stats.errors.push(`${u.email}: odroczony OOF nieudany (${result.error})`)
        await admin
            .from('leave_requests')
            .update({ graph_sync_error: `oof: ${result.error}` })
            .eq('id', leave.id)
    }
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
