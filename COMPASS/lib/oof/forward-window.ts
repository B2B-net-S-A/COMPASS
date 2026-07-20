// Phase 41 — when should mail forwarding to the substitute be active?
//
// An Outlook inbox rule has NO time conditions (messageRulePredicates carries no
// date/schedule field), so unlike OOF — where Exchange itself honours
// scheduledStart/EndDateTime — the window has to be opened and closed by us.
// This module is the single source of truth for "should there be a rule right now",
// used by both the leave actions and the daily cron.
//
// Pure and deterministic (`now` is injected, never read from the clock) so the
// boundary behaviour is unit-testable. Imports stay relative, matching oof-dates.ts.

import { warsawDate } from './oof-dates'

export interface ForwardWindowLeave {
    status: string
    substituteId: string | null
    /** YYYY-MM-DD, inclusive. */
    startDate: string
    /** YYYY-MM-DD, inclusive. */
    endDate: string
}

/**
 * Calendar arithmetic on a YYYY-MM-DD string via UTC, so it is immune to both the
 * runtime timezone and DST transitions. Same idiom as graph-oof.ts.
 */
function shiftIsoDate(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/** Today's calendar date in Warsaw. */
export function warsawToday(now: Date): string {
    return warsawDate(now)
}

/** Tomorrow's calendar date in Warsaw. */
export function warsawTomorrow(now: Date): string {
    return shiftIsoDate(warsawDate(now), 1)
}

/**
 * True when an approved leave with a substitute should currently have a forwarding
 * rule in the employee's mailbox.
 *
 * The window is the leave itself: it opens on the first day (`startDate <= today`)
 * and never before. Approving a leave in advance must not start forwarding — mail
 * moving to the substitute while the employee is still at their desk surprises both
 * of them, and the substitute sees correspondence they were not yet standing in for.
 *
 * The cost is a gap on the first morning: the rule appears when the cron runs, so
 * mail arriving between midnight and that run is never forwarded (it does still land
 * in the owner's mailbox — forwarding copies, it does not move). Shrink that gap by
 * running the cron earlier, not by opening a day early. `warsawTomorrow` is kept as
 * the escape hatch should this trade ever be revisited.
 *
 * Both bounds are inclusive; `endDate` is the last day of the leave.
 */
export function shouldForwardBeActive(leave: ForwardWindowLeave, now: Date): boolean {
    if (leave.status !== 'approved') return false
    if (!leave.substituteId) return false
    if (!leave.startDate || !leave.endDate) return false
    return leave.startDate <= warsawToday(now) && leave.endDate >= warsawToday(now)
}

export interface ForwardEditPlan {
    /** Tear the existing rule down — it points at the wrong person or window. */
    close: boolean
    /** Create a rule for the leave's current substitute and window. */
    open: boolean
}

/**
 * What has to happen to the forwarding rule after a manager edits a leave.
 *
 * A rule names one recipient and never expires, so editing a leave without touching
 * it leaves mail going to the previous substitute, or forwarding past the end date.
 *
 * `open` is true whenever forwarding is owed and no *correct* rule is in place —
 * either because we are replacing one (`close`) or because none existed. An
 * untouched leave whose rule is already right yields `{close: false, open: false}`,
 * so a note-only edit does not churn the mailbox.
 *
 * Callers must additionally refuse to open when a requested close failed; that is a
 * runtime condition this function cannot see.
 *
 * Pure function — exported for unit testing.
 */
export function planForwardRuleEdit(input: {
    hasExistingRule: boolean
    substituteChanged: boolean
    datesChanged: boolean
    forwardShouldExist: boolean
}): ForwardEditPlan {
    const close =
        input.hasExistingRule &&
        (input.substituteChanged || input.datesChanged || !input.forwardShouldExist)
    const open = input.forwardShouldExist && (close || !input.hasExistingRule)
    return { close, open }
}
