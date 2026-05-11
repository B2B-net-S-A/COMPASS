'use server'

import { createClient } from '@/lib/supabase/server'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import {
    type ClockDailyAggregate,
    type ClockMonthData,
    type ClockSessionListItem,
    type ClockSessionRow,
} from '@/lib/clock/constants'
import {
    mapToSessionListItem,
    summarizeClockMonth,
} from '@/lib/clock/session-lifecycle'
import { getMonthDateRange, getMonthIsoRange } from '@/lib/clock/time-zones'

export async function getMyClockMonth(year: number, month: number): Promise<ClockMonthData> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { start, end } = getMonthDateRange(year, month)
    const { data, error } = await supabase
        .from('work_clock_daily')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date')
    if (error) throw new Error(`Błąd pobierania zegara: ${error.message}`)
    return summarizeClockMonth(year, month, (data ?? []) as ClockDailyAggregate[])
}

export async function getMyClockSessionsForMonth(
    year: number,
    month: number,
): Promise<ClockSessionListItem[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { startIso, endIso } = getMonthIsoRange(year, month)
    const { data, error } = await supabase
        .from('work_clock_sessions')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('started_at', startIso)
        .lte('started_at', endIso)
        .order('started_at', { ascending: false })
    if (error) throw new Error(`Błąd pobierania sesji: ${error.message}`)
    return ((data ?? []) as ClockSessionRow[]).map(mapToSessionListItem)
}
