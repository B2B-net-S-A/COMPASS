'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'

/** R11 (PR-D): user toggle for daily summary email. */
export async function setMyClockSummaryEmailPreference(enabled: boolean): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { error } = await admin
        .from('profiles')
        .update({ clock_daily_summary_email: enabled })
        .eq('id', ctx.userId)
    if (error) throw new Error(`Błąd zapisu preferencji: ${error.message}`)
}
