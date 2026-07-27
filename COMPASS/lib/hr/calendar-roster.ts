// Team calendar roster — who belongs on the month grid.
//
// The calendar used to select the HR-zone roster by `role` alone, with no
// employment filter, so people archived out of the company kept showing up
// forever (an employee who left in June still had a row in the July grid).
//
// Employment is a timeline, not a flag: the calendar renders ONE month, so the
// roster must be resolved for THAT month. Someone leaves the grid starting with
// the month after their last working day — never earlier. That keeps historic
// months honest (June still shows the person who worked all of June) while the
// current month stops listing people who are already gone.
//
// `termination_date` is the source of truth when present; `employment_status`
// is only the fallback for legacy rows archived before the date was recorded.
// `cancelExitInterview` clears both together, so a re-activated employee comes
// back onto the calendar automatically.

export interface CalendarRosterMember {
    employment_status?: string | null
    termination_date?: string | null
}

/**
 * True when the employee should appear on the calendar for the month starting
 * at `monthStart` (ISO `yyyy-mm-dd`, the 1st of the displayed month).
 *
 * ISO dates compare correctly as strings — no Date/timezone conversion needed.
 */
export function isOnCalendarRosterForMonth(
    member: CalendarRosterMember,
    monthStart: string,
): boolean {
    // Last working day known → visible through that month, hidden afterwards.
    if (member.termination_date) return member.termination_date >= monthStart

    // No date recorded: only an explicit `exited` removes them (defensive —
    // legacy archives predating termination_date tracking).
    return member.employment_status !== 'exited'
}

/** Drop everyone whose employment ended before the displayed month began. */
export function filterCalendarRoster<T extends CalendarRosterMember>(
    members: readonly T[],
    monthStart: string,
): T[] {
    return members.filter((m) => isOnCalendarRosterForMonth(m, monthStart))
}
