import { describe, expect, it } from 'vitest'

import {
    buildTimesheetRosterView,
    isTimesheetPlaceholder,
    type TimesheetRosterMember,
} from '@/lib/hr/timesheet-roster'
import type { TimesheetWithEntriesAndUser } from '@/lib/actions/internal-timesheet'

function realRow(
    overrides: Partial<TimesheetWithEntriesAndUser> & { user_id: string },
): TimesheetWithEntriesAndUser {
    return {
        id: `ts-${overrides.user_id}`,
        year: 2026,
        month: 5,
        status: 'draft',
        submitted_at: null,
        approved_by: null,
        approved_at: null,
        rejection_note: null,
        pdf_hash: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
        auto_filled_at: null,
        user_cleared_auto_fill: false,
        entries: [],
        user_full_name: null,
        user_email: `${overrides.user_id}@b2bnetwork.pl`,
        ...overrides,
    }
}

const roster: TimesheetRosterMember[] = [
    { id: 'u-anna', full_name: 'Anna Nowak', email: 'anna@b2bnetwork.pl' },
    { id: 'u-bartek', full_name: 'Bartek Kowal', email: 'bartek@b2bnetwork.pl' },
    { id: 'u-celina', full_name: 'Celina Wójcik', email: 'celina@b2bnetwork.pl' },
]

describe('buildTimesheetRosterView', () => {
    it('adds an empty placeholder for every roster member without a timesheet', () => {
        const existing = [realRow({ user_id: 'u-anna', user_full_name: 'Anna Nowak' })]

        const view = buildTimesheetRosterView(existing, roster, 2026, 5)

        expect(view).toHaveLength(3)
        const bartek = view.find((r) => r.user_id === 'u-bartek')!
        expect(isTimesheetPlaceholder(bartek)).toBe(true)
        expect(bartek.id).toBe('')
        expect(bartek.entries).toEqual([])
        expect(bartek.status).toBe('draft')
        expect(bartek.year).toBe(2026)
        expect(bartek.month).toBe(5)
        expect(bartek.user_full_name).toBe('Bartek Kowal')
    })

    it('keeps the real row (no placeholder) for members who already have a timesheet', () => {
        const existing = [
            realRow({ user_id: 'u-anna', user_full_name: 'Anna Nowak', status: 'submitted' }),
        ]

        const view = buildTimesheetRosterView(existing, roster, 2026, 5)
        const anna = view.find((r) => r.user_id === 'u-anna')!

        expect(isTimesheetPlaceholder(anna)).toBe(false)
        expect(anna.id).toBe('ts-u-anna')
        expect(anna.status).toBe('submitted')
        // Anna is not duplicated as a placeholder.
        expect(view.filter((r) => r.user_id === 'u-anna')).toHaveLength(1)
    })

    it('sorts submitted (action needed) first, then alphabetically by name', () => {
        const existing = [
            realRow({ user_id: 'u-celina', user_full_name: 'Celina Wójcik', status: 'submitted' }),
            realRow({ user_id: 'u-anna', user_full_name: 'Anna Nowak', status: 'approved' }),
        ]

        const view = buildTimesheetRosterView(existing, roster, 2026, 5)

        // Celina (submitted) first; then drafts alphabetically (Bartek placeholder);
        // approved (Anna) last.
        expect(view.map((r) => r.user_id)).toEqual(['u-celina', 'u-bartek', 'u-anna'])
    })

    it('returns only placeholders when no timesheets exist yet', () => {
        const view = buildTimesheetRosterView([], roster, 2026, 5)

        expect(view).toHaveLength(3)
        expect(view.every(isTimesheetPlaceholder)).toBe(true)
        // Alphabetical by name: Anna, Bartek, Celina.
        expect(view.map((r) => r.user_id)).toEqual(['u-anna', 'u-bartek', 'u-celina'])
    })

    it('returns an empty list when roster is empty and no timesheets exist', () => {
        expect(buildTimesheetRosterView([], [], 2026, 5)).toEqual([])
    })
})
