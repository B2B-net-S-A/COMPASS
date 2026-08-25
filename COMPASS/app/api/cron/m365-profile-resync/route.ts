import { NextResponse } from 'next/server'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { syncProfileFromGraph } from '@/lib/m365/people-sync'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const STALE_DAYS = 7
const MAX_PER_RUN = 100

/**
 * Weekly catch-up sync of org-chart fields from Microsoft Graph.
 *
 * Targets profiles where `m365_synced_at IS NULL` (never synced — new users
 * who haven't logged in since this feature shipped) or where the last sync
 * is older than STALE_DAYS (someone changed manager/department in Azure
 * and we haven't picked it up because they didn't log in).
 *
 * Caps at MAX_PER_RUN profiles per run to avoid hammering Graph if the
 * stale set grows large. Cron runs weekly, so the cap is effectively
 * 100 × ~4-5 weeks/month = enough headroom for our 128-user tenant.
 *
 * Coolify cron suggestion: `0 4 * * 0` (Sunday 04:00 UTC).
 */
export const GET = withCronAuth(withCronHeartbeat('M365_PROFILE_RESYNC_RUN', async (_request, { admin }) => {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Stale = never synced OR last sync older than STALE_DAYS.
    // Two queries because PostgREST `.or()` with IS NULL is finicky — easier
    // to merge in memory than fight the filter syntax.
    const [{ data: neverSynced }, { data: staleSyncs }] = await Promise.all([
        admin
            .from('profiles')
            .select('id, email')
            .is('m365_synced_at', null)
            .ilike('email', '%@b2bnetwork.pl')
            .limit(MAX_PER_RUN),
        admin
            .from('profiles')
            .select('id, email')
            .lt('m365_synced_at', cutoff)
            .ilike('email', '%@b2bnetwork.pl')
            .limit(MAX_PER_RUN),
    ])

    const candidates = [
        ...((neverSynced ?? []) as Array<{ id: string; email: string }>),
        ...((staleSyncs ?? []) as Array<{ id: string; email: string }>),
    ].slice(0, MAX_PER_RUN)

    let synced = 0
    let failed = 0
    let skipped = 0
    for (const p of candidates) {
        const r = await syncProfileFromGraph(p.id, p.email)
        if (r.success && !r.skipped) synced++
        else if (r.skipped) skipped++
        else failed++
    }

    logger.info({
        event: 'cron.m365_resync.done',
        candidates: candidates.length,
        synced,
        failed,
        skipped,
    })

    return NextResponse.json({
        ok: true,
        candidates: candidates.length,
        synced,
        failed,
        skipped,
    })
}))
