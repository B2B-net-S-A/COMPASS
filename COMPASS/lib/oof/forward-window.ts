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
 * The window opens one day EARLY (`startDate <= tomorrow`) on purpose: the cron runs
 * at 06:00 UTC, so opening on the first day of the leave would leave mail arriving
 * between midnight and ~08:00 Warsaw unforwarded. The cost is that forwarding also
 * covers the last working day before the leave. To trade back, change
 * `warsawTomorrow` to `warsawToday` here — that is the only knob.
 *
 * Both bounds are inclusive; `endDate` is the last day of the leave.
 */
export function shouldForwardBeActive(leave: ForwardWindowLeave, now: Date): boolean {
    if (leave.status !== 'approved') return false
    if (!leave.substituteId) return false
    if (!leave.startDate || !leave.endDate) return false
    return leave.startDate <= warsawTomorrow(now) && leave.endDate >= warsawToday(now)
}
