import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Phase 17b R12 — route metadata retention cron.
 *
 * Deletes work_clock_route_metadata rows older than 30 days. Sessions
 * (work_clock_sessions) are NOT touched — they keep 5-year retention per
 * KP art. 94⁴. Only the URL/page-title metadata is purged.
 *
 * Trigger: weekly (Coolify cron, e.g. Sunday at 03:00 UTC).
 *
 * Auth (preferred — secret NOT logged in CF/proxy/Sentry traces):
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/clock-route-retention" \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
export async function GET(request: Request) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    const url = new URL(request.url)
    const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const querySecret = url.searchParams.get('secret')
    const provided = headerSecret || querySecret
    if (!provided || provided !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceClient()
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { count, error } = await admin
        .from('work_clock_route_metadata')
        .delete({ count: 'exact' })
        .lt('ts_bucket_5min', cutoff)

    if (error) {
        logCompat.error('[clock-route-retention] delete error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, cutoff, deleted: count ?? 0 })
}
