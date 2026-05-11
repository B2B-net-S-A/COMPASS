'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'

/**
 * R8: mark a timesheet as auto-filled (idempotency). Set after first
 * suggestTimesheetEntriesFromClock call from TimesheetPanel — prevents
 * re-running auto-fill on every page refresh.
 */
export async function markTimesheetAutoFilled(timesheetId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: header } = await admin
        .from('timesheets')
        .select('id, user_id, auto_filled_at')
        .eq('id', timesheetId)
        .single<{ id: string; user_id: string; auto_filled_at: string | null }>()
    if (!header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.auto_filled_at) return
    await admin
        .from('timesheets')
        .update({ auto_filled_at: new Date().toISOString() })
        .eq('id', timesheetId)
}

/**
 * R8: user explicitly cleared the auto-filled draft. Records flag so the
 * panel won't regenerate entries on next visit.
 */
export async function clearAutoFilledTimesheet(timesheetId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: header } = await admin
        .from('timesheets')
        .select('id, user_id, status')
        .eq('id', timesheetId)
        .single<{ id: string; user_id: string; status: string }>()
    if (!header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Timesheet nie jest w statusie draft.')
    }
    await admin
        .from('timesheet_entries')
        .delete()
        .eq('timesheet_id', timesheetId)
        .in('source', ['clock_suggested', 'clock_accepted'])
    await admin
        .from('timesheets')
        .update({ user_cleared_auto_fill: true })
        .eq('id', timesheetId)
}
