// Phase 28 — Placement status tick.
//
// Schedule (Coolify): 0 6 * * *  (daily 06:00 UTC)
// Auth: Authorization: Bearer $CRON_SECRET
//
// Side-effect: advances placements 'upcoming' → 'started' once start_date <= today.
// Response: { ok, advanced }

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = withCronAuth(async (_request, { admin }) => {
    const today = new Date().toISOString().slice(0, 10)
    try {
        const { data, error } = await admin
            .from('placements')
            .update({ status: 'started', updated_at: new Date().toISOString() })
            .eq('status', 'upcoming')
            .lte('start_date', today)
            .select('id')
        if (error) throw new Error(error.message)
        const advanced = data?.length ?? 0
        if (advanced > 0) logger.info({ event: 'placement.status_tick', advanced })
        return NextResponse.json({ ok: true, advanced })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error'
        logger.error({ event: 'placement.status_tick.exception', error: message })
        Sentry.captureException(err, { tags: { kind: 'placement_status_tick' } })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
})
