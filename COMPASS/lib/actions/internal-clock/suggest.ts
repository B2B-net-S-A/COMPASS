'use server'

import { createClient } from '@/lib/supabase/server'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import {
    type SuggestEntriesInput,
    type SuggestEntriesResult,
} from '@/lib/clock/constants'
import { selectSuggestableEntries } from '@/lib/clock/daily-summary'
import { getMonthDateRange } from '@/lib/clock/time-zones'

/**
 * Generate timesheet_entries from work_clock_daily for the timesheet's month.
 * Skips dates with blocking attendance or where an entry already exists.
 *
 * If overwriteSuggestions=true, deletes existing clock_suggested entries first.
 * Hours stored at NUMERIC(4,2) precision; clamped to (0.01, 24).
 */
export async function suggestTimesheetEntriesFromClock(
    input: SuggestEntriesInput,
): Promise<SuggestEntriesResult> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: header, error: fetchErr } = await supabase
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', input.timesheetId)
        .single<{ id: string; user_id: string; year: number; month: number; status: string }>()
    if (fetchErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Timesheet musi być w statusie "draft".')
    }

    const { start, end } = getMonthDateRange(header.year, header.month)

    if (input.overwriteSuggestions) {
        await supabase
            .from('timesheet_entries')
            .delete()
            .eq('timesheet_id', input.timesheetId)
            .in('source', ['clock_suggested', 'clock_accepted'])
    }

    const [dailyRes, attendanceRes, existingRes] = await Promise.all([
        supabase
            .from('work_clock_daily')
            .select('work_date, hours, session_count')
            .eq('user_id', header.user_id)
            .gte('work_date', start)
            .lte('work_date', end),
        supabase
            .from('attendance_records')
            .select('date, status')
            .eq('user_id', header.user_id)
            .gte('date', start)
            .lte('date', end),
        supabase
            .from('timesheet_entries')
            .select('work_date, source')
            .eq('timesheet_id', input.timesheetId),
    ])
    if (dailyRes.error) throw new Error(`Błąd pobierania zegara: ${dailyRes.error.message}`)
    if (attendanceRes.error) throw new Error(`Błąd pobierania obecności: ${attendanceRes.error.message}`)
    if (existingRes.error) throw new Error(`Błąd pobierania wpisów: ${existingRes.error.message}`)

    const decision = selectSuggestableEntries({
        days: (dailyRes.data ?? []) as Array<{
            work_date: string
            hours: number
            session_count: number
        }>,
        attendance: (attendanceRes.data ?? []) as Array<{ date: string; status: string }>,
        existingEntries: (existingRes.data ?? []) as Array<{ work_date: string; source: string }>,
    })

    if (decision.entries.length > 0) {
        const rows = decision.entries.map((e) => ({
            timesheet_id: input.timesheetId,
            work_date: e.work_date,
            hours: e.hours,
            project: null,
            description: e.description,
            source: 'clock_suggested' as const,
            tracked_hours: e.hours,
        }))
        const { error } = await supabase.from('timesheet_entries').insert(rows)
        if (error) throw new Error(`Błąd zapisu wpisów: ${error.message}`)
    }

    return {
        inserted: decision.entries.length,
        skipped_existing: decision.skippedExisting,
        total_days_with_tracking: decision.totalDaysWithTracking,
    }
}
