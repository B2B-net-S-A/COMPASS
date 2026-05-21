// Phase 27g — manager/admin "fill timesheet on behalf" roster view.
//
// The HR timesheet queue used to show only timesheets that already existed for
// the month (an employee got a row the first time they opened their tab). That
// hid team members who never touched their timesheet, so a manager could not
// start one for them. This pure helper merges the existing rows with the full
// team roster and synthesizes an empty placeholder row for every member without
// a timesheet yet, so the manager sees everyone and can fill anyone's.
//
// Placeholder rows carry id='' and entries=[]; they are materialized into a real
// draft timesheet by ensureTeamTimesheet() the moment the manager opens one.

import type {
    TimesheetStatus,
    TimesheetWithEntriesAndUser,
} from '@/lib/actions/internal-timesheet'

export interface TimesheetRosterMember {
    id: string
    full_name: string | null
    email: string
}

const STATUS_SORT_ORDER: Record<TimesheetStatus, number> = {
    submitted: 0, // needs the approver's action first
    draft: 1,
    rejected: 2,
    approved: 3,
}

/** True when the row is a synthetic placeholder (no timesheet exists yet). */
export function isTimesheetPlaceholder(row: TimesheetWithEntriesAndUser): boolean {
    return row.id === ''
}

function buildPlaceholder(
    member: TimesheetRosterMember,
    year: number,
    month: number,
): TimesheetWithEntriesAndUser {
    return {
        id: '',
        user_id: member.id,
        year,
        month,
        status: 'draft',
        submitted_at: null,
        approved_by: null,
        approved_at: null,
        rejection_note: null,
        pdf_hash: null,
        created_at: '',
        updated_at: '',
        auto_filled_at: null,
        user_cleared_auto_fill: false,
        entries: [],
        user_full_name: member.full_name,
        user_email: member.email,
    }
}

/**
 * Merge the existing timesheet rows for a month with the team roster, adding an
 * empty placeholder for every roster member that has no timesheet yet. Sorted
 * submitted-first (action needed) then alphabetically by display name.
 */
export function buildTimesheetRosterView(
    existing: TimesheetWithEntriesAndUser[],
    roster: TimesheetRosterMember[],
    year: number,
    month: number,
): TimesheetWithEntriesAndUser[] {
    const withTimesheet = new Set(existing.map((t) => t.user_id))
    const placeholders = roster
        .filter((member) => !withTimesheet.has(member.id))
        .map((member) => buildPlaceholder(member, year, month))

    return [...existing, ...placeholders].sort((a, b) => {
        const orderA = STATUS_SORT_ORDER[a.status] ?? 9
        const orderB = STATUS_SORT_ORDER[b.status] ?? 9
        if (orderA !== orderB) return orderA - orderB
        const nameA = a.user_full_name ?? a.user_email
        const nameB = b.user_full_name ?? b.user_email
        return nameA.localeCompare(nameB, 'pl')
    })
}
