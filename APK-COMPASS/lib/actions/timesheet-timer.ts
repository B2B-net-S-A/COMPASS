'use server'

import { createClient } from '@/lib/supabase/server'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { revalidatePath } from 'next/cache'

// ============================================================
// H3.6 — Timesheet Timer (start/stop) server actions
// ============================================================

export interface TimesheetTimerRow {
    id: string
    user_id: string
    started_at: string
    stopped_at: string | null
    work_date: string
    project: string | null
    description: string
    hours_calculated: number | null
    converted_entry_id: string | null
    created_at: string
}

/**
 * Pobiera aktywny timer usera (jeśli istnieje).
 */
export async function getActiveTimer(): Promise<TimesheetTimerRow | null> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data } = await supabase
        .from('timesheet_timers')
        .select('*')
        .eq('user_id', ctx.userId)
        .is('stopped_at', null)
        .maybeSingle<TimesheetTimerRow>()
    return data ?? null
}

interface StartTimerInput {
    project?: string | null
    description?: string
}

/**
 * Phase 17b R5: H3.6 timer is deprecated. Use Smart Work Clock (Phase 17)
 * floating button "Start pracy" instead. This function throws to surface the
 * change to any caller (UI is already removed in PR-A2; this guards against
 * direct API/server-action callers).
 */
export async function startTimer(_input: StartTimerInput = {}): Promise<TimesheetTimerRow> {
    void _input
    await requireInternalOrAdminAction()
    // Throwing — no need for ctx/userId
    throw new Error(
        'Timer H3.6 został zastąpiony przez Smart Work Clock (Phase 17). ' +
            'Użyj zielonego przycisku "Start pracy" w prawym dolnym rogu.',
    )
}

/**
 * Stop bieżący timer. Zwraca finalne dane (z hours_calculated).
 * Min 1 minuta (60s) — krótsze odrzucamy żeby nie zaśmiecać.
 */
export async function stopActiveTimer(): Promise<TimesheetTimerRow> {
    await requireInternalOrAdminAction()
    const supabase = createClient()

    const active = await getActiveTimer()
    if (!active) throw new Error('Brak aktywnego timera.')

    const stoppedAt = new Date()
    const startedAt = new Date(active.started_at)
    const durationMs = stoppedAt.getTime() - startedAt.getTime()
    if (durationMs < 60_000) {
        // Cancel zamiast save (delete row)
        await supabase.from('timesheet_timers').delete().eq('id', active.id)
        throw new Error('Timer trwał krócej niż 1 min — anulowany.')
    }

    const { data, error } = await supabase
        .from('timesheet_timers')
        .update({ stopped_at: stoppedAt.toISOString() })
        .eq('id', active.id)
        .select('*')
        .single<TimesheetTimerRow>()
    if (error) throw new Error(`Błąd stop timera: ${error.message}`)

    revalidatePath('/internal')
    return data
}

/**
 * Anuluj aktywny timer (delete bez save).
 */
export async function cancelActiveTimer(): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const active = await getActiveTimer()
    if (!active) return
    const { error } = await supabase
        .from('timesheet_timers')
        .delete()
        .eq('id', active.id)
        .eq('user_id', ctx.userId)
    if (error) throw new Error(`Błąd anulowania: ${error.message}`)
    revalidatePath('/internal')
}

/**
 * Zatrzymane (stopped) timery z bieżącego miesiąca, jeszcze nie skonwertowane do timesheet_entries.
 * UI listuje je jako "Pending zapisy" z buttonem "Dodaj do timesheetu".
 */
export async function listPendingStoppedTimers(year: number, month: number): Promise<TimesheetTimerRow[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEndDate = new Date(year, month, 0)
    const monthEnd = monthEndDate.toISOString().slice(0, 10)

    const { data, error } = await supabase
        .from('timesheet_timers')
        .select('*')
        .eq('user_id', ctx.userId)
        .not('stopped_at', 'is', null)
        .is('converted_entry_id', null)
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd)
        .order('started_at', { ascending: false })
    if (error) throw new Error(`Błąd: ${error.message}`)
    return (data ?? []) as TimesheetTimerRow[]
}

/**
 * Konwertuj zatrzymany timer do timesheet entry. Marks `converted_entry_id`.
 */
export async function convertTimerToEntry(timerId: string, timesheetId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: timer, error: fetchErr } = await supabase
        .from('timesheet_timers')
        .select('*')
        .eq('id', timerId)
        .eq('user_id', ctx.userId)
        .single<TimesheetTimerRow>()
    if (fetchErr || !timer) throw new Error('Timer nie istnieje.')
    if (!timer.stopped_at) throw new Error('Timer jeszcze biega — zatrzymaj go najpierw.')
    if (timer.converted_entry_id) throw new Error('Timer już skonwertowany.')
    if (!timer.hours_calculated) throw new Error('Timer nie ma godzin (zbyt krótki?).')

    // Sprawdź timesheet (status draft + ownership)
    const { data: ts } = await supabase
        .from('timesheets')
        .select('id, user_id, status, year, month')
        .eq('id', timesheetId)
        .single<{ id: string; user_id: string; status: string; year: number; month: number }>()
    if (!ts) throw new Error('Timesheet nie istnieje.')
    if (ts.user_id !== ctx.userId && !ctx.isAdmin) throw new Error('To nie Twój timesheet.')
    if (ts.status !== 'draft') throw new Error('Można dodać tylko do timesheetu draft.')

    // Insert entry
    const { data: entry, error: insErr } = await supabase
        .from('timesheet_entries')
        .insert({
            timesheet_id: timesheetId,
            work_date: timer.work_date,
            hours: timer.hours_calculated,
            project: timer.project,
            description: timer.description,
        })
        .select('id')
        .single<{ id: string }>()
    if (insErr) throw new Error(`Błąd insert entry: ${insErr.message}`)

    // Mark timer as converted
    const { error: updErr } = await supabase
        .from('timesheet_timers')
        .update({ converted_entry_id: entry.id })
        .eq('id', timerId)
    if (updErr) console.warn('[convertTimerToEntry] mark converted failed:', updErr)

    revalidatePath(`/internal/timesheet/${ts.year}/${ts.month}`)
}
