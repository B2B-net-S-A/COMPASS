// Who was employed during a given month — shared rule for month-scoped views
// and reports (team calendar, payroll export).
//
// Employment is a timeline, not a flag. A view that renders ONE month has to ask
// "did this person work THAT month", not "do they work today". Otherwise you get
// one of two lies: archived people stay on the current view forever (that was
// the calendar bug), or someone who left on the 20th vanishes from a month they
// mostly worked (the same trap in payroll).
//
// Rule: a person drops out starting with the month AFTER their last working day.
//
// `termination_date` is the source of truth; `employment_status='exited'` is only
// the fallback for legacy rows archived before the date was recorded.
// `cancelExitInterview` clears both together, so a re-activated employee comes
// back on their own, with no manual intervention.
//
// NOTE — this is NOT the rule for "right now" lists (messaging recipients,
// assignment dropdowns, notification blasts). Those use the simpler
// `employment_status <> 'exited'`, because they are not scoped to any month.

export interface EmploymentWindowFields {
    employment_status?: string | null
    termination_date?: string | null
}

/**
 * True when the employee was employed during the month starting at `monthStart`
 * (ISO `yyyy-mm-dd`, the 1st of the displayed month).
 *
 * ISO dates compare correctly as strings — no Date/timezone conversion needed.
 */
export function isEmployedInMonth(
    member: EmploymentWindowFields,
    monthStart: string,
): boolean {
    // Last working day known → included through that month, excluded afterwards.
    if (member.termination_date) return member.termination_date >= monthStart

    // No date recorded: only an explicit `exited` removes them (defensive —
    // legacy archives predating termination_date tracking).
    return member.employment_status !== 'exited'
}

/** Drop everyone whose employment ended before the given month began. */
export function filterEmployedInMonth<T extends EmploymentWindowFields>(
    members: readonly T[],
    monthStart: string,
): T[] {
    return members.filter((m) => isEmployedInMonth(m, monthStart))
}
