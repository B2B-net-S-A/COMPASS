'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { logCompat } from '@/lib/logger'
import { requireAdminAction, requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendCorrectionDecision } from '@/lib/email'
import { isCorrectionRequired } from '@/lib/clock/aggregation'
import {
    type CorrectionEntryView,
    type FlagCorrectionInput,
} from '@/lib/clock/constants'
import { getMonthDateRange } from '@/lib/clock/time-zones'
import { fetchTimesheetOwner, type AdminClient } from './_shared'

export async function listClockSessionsForReview(
    year: number,
    month: number,
): Promise<CorrectionEntryView[]> {
    await requireAdminAction()
    const admin = createServiceClient()
    const { start, end } = getMonthDateRange(year, month)

    const { data, error } = await admin
        .from('timesheet_entries')
        .select(`
            id, timesheet_id, work_date, hours, tracked_hours, description, project, source, created_at,
            timesheets!inner(user_id, year, month),
            timesheets:timesheet_id(user_id, profiles!inner(full_name, email))
        `)
        .eq('correction_required', true)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date')
    if (error) throw new Error(`Błąd pobierania korekt: ${error.message}`)

    type Row = {
        id: string
        timesheet_id: string
        work_date: string
        hours: number
        tracked_hours: number | null
        description: string
        project: string | null
        source: 'manual' | 'clock_suggested' | 'clock_accepted'
        created_at: string
        timesheets: {
            user_id: string
            profiles: { full_name: string | null; email: string }
        }
    }

    return ((data ?? []) as unknown as Row[]).map((r) => ({
        entry_id: r.id,
        timesheet_id: r.timesheet_id,
        user_id: r.timesheets.user_id,
        user_full_name: r.timesheets.profiles.full_name,
        user_email: r.timesheets.profiles.email,
        work_date: r.work_date,
        hours: Number(r.hours),
        tracked_hours: r.tracked_hours == null ? null : Number(r.tracked_hours),
        declared_minus_tracked:
            r.tracked_hours == null ? null : Number(r.hours) - Number(r.tracked_hours),
        description: r.description,
        project: r.project,
        source: r.source,
        created_at: r.created_at,
    }))
}

async function fetchCorrectionEntry(admin: AdminClient, entryId: string) {
    const { data: row, error } = await admin
        .from('timesheet_entries')
        .select('id, work_date, hours, tracked_hours, correction_required, timesheet_id')
        .eq('id', entryId)
        .single<{
            id: string
            work_date: string
            hours: number
            tracked_hours: number | null
            correction_required: boolean
            timesheet_id: string
        }>()
    if (error || !row) throw new Error('Wpis nie istnieje.')
    if (!row.correction_required) throw new Error('Wpis nie wymaga korekty.')
    return row
}

export async function approveCorrection(entryId: string, note?: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()
    const row = await fetchCorrectionEntry(admin, entryId)

    const { error } = await admin
        .from('timesheet_entries')
        .update({
            correction_required: false,
            correction_decided_by: ctx.userId,
            correction_decided_at: new Date().toISOString(),
            correction_decision_note: note?.trim() || null,
        })
        .eq('id', entryId)
    if (error) throw new Error(`Błąd zatwierdzenia: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_CORRECTION_APPROVED', {
        entry_id: entryId,
        timesheet_id: row.timesheet_id,
        work_date: row.work_date,
        declared: row.hours,
        tracked: row.tracked_hours,
    })

    const owner = await fetchTimesheetOwner(admin, row.timesheet_id)
    if (owner) {
        sendCorrectionDecision(
            owner.email,
            owner.full_name ?? owner.email,
            'approved',
            row.work_date,
            Number(row.hours),
            row.tracked_hours == null ? null : Number(row.tracked_hours),
            note,
        ).catch((e) => logCompat.error('[approveCorrection] notify failed:', e))
    }
}

export async function rejectCorrection(entryId: string, note: string): Promise<void> {
    const ctx = await requireAdminAction()
    if (!note?.trim()) throw new Error('Uzasadnienie odrzucenia jest wymagane.')
    const admin = createServiceClient()
    const row = await fetchCorrectionEntry(admin, entryId)

    const updates: Record<string, unknown> = {
        correction_required: false,
        correction_decided_by: ctx.userId,
        correction_decided_at: new Date().toISOString(),
        correction_decision_note: note.trim(),
    }
    if (row.tracked_hours != null) updates.hours = row.tracked_hours

    const { error } = await admin.from('timesheet_entries').update(updates).eq('id', entryId)
    if (error) throw new Error(`Błąd odrzucenia: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_CORRECTION_REJECTED', {
        entry_id: entryId,
        timesheet_id: row.timesheet_id,
        work_date: row.work_date,
        declared: row.hours,
        tracked: row.tracked_hours,
        reverted_to_tracked: row.tracked_hours != null,
    })

    const owner = await fetchTimesheetOwner(admin, row.timesheet_id)
    if (owner) {
        sendCorrectionDecision(
            owner.email,
            owner.full_name ?? owner.email,
            'rejected',
            row.work_date,
            Number(row.hours),
            row.tracked_hours == null ? null : Number(row.tracked_hours),
            note,
        ).catch((e) => logCompat.error('[rejectCorrection] notify failed:', e))
    }
}

/**
 * Apply discrepancy detection logic and update correction_required flag.
 * Called from internal-timesheet.updateEntry after a successful update.
 *
 * Rule: declared > 13h (KP art. 129) OR |declared - tracked| > 1.0h.
 */
export async function applyCorrectionFlag(input: FlagCorrectionInput): Promise<void> {
    await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const flag = isCorrectionRequired(input.declaredHours, input.trackedHours)
    await admin
        .from('timesheet_entries')
        .update({
            correction_required: flag,
            ...(flag
                ? {}
                : {
                      correction_decided_by: null,
                      correction_decided_at: null,
                      correction_decision_note: null,
                  }),
        })
        .eq('id', input.entryId)
}
