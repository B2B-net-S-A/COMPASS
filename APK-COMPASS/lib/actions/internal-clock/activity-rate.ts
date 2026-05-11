'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { bucketActivityRates, type ActivityRateBucket } from '@/lib/clock/daily-summary'
import { assertIsoDate, getDayIsoRange } from '@/lib/clock/time-zones'

/**
 * R4: Activity rate per 10-min bucket for the CURRENT USER ONLY.
 *
 * Privacy contract: this function ALWAYS returns data for the caller
 * (ctx.userId) — even an admin caller cannot pass a targetUserId. Activity
 * rate per bucket is considered surveillance-grade for admins (Hubstaff);
 * Compass policy: aggregate hours visible to admin via timesheets, granular
 * rate is private.
 */
export async function getMyActivityRateForDay(date: string): Promise<ActivityRateBucket[]> {
    const ctx = await requireInternalOrAdminAction()
    assertIsoDate(date)
    const admin = createServiceClient()
    const { startIso: dayStart, endIso: dayEnd } = getDayIsoRange(date)

    const { data: sessions } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .or(`started_at.lte.${dayEnd},ended_at.gte.${dayStart}`)
    const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id)
    if (sessionIds.length === 0) return []

    const { data: hb } = await admin
        .from('work_clock_heartbeats')
        .select('ts, was_active')
        .in('session_id', sessionIds)
        .gte('ts', dayStart)
        .lte('ts', dayEnd)
        .order('ts')
    return bucketActivityRates((hb ?? []) as Array<{ ts: string; was_active: boolean }>)
}
