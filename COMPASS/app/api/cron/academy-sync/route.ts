import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { runAcademyDatabaseSync } from '@/lib/academy/db-worker'
import { runAcademyOutboxHousekeeping } from '@/lib/academy/outbound'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** The normal authenticated scheduler should invoke this every minute. No public user-triggered Graph writes. */
export const GET = withCronAuth(withCronHeartbeat('ACADEMY_SYNC_RUN', async (_request, { admin }) => {
    try {
        const client = admin as unknown as SupabaseClient
        const result = await runAcademyDatabaseSync({ client })
        // Brak tabeli (migracja jeszcze nie zastosowana) nie jest awarią crona.
        const outbox = await runAcademyOutboxHousekeeping(client)
        const ok = result.failed === 0 && result.failedOperations.length === 0 && outbox.status !== 'failed'
        logger.info({ event: 'academy.sync.finished', ...result, outbox })
        return NextResponse.json({ ok, ...result, outbox }, { status: ok ? 200 : 503 })
    } catch {
        logger.error({ event: 'academy.sync.failed', reason: 'worker_or_persistence_failure' })
        return NextResponse.json({ ok: false, error: 'academy_sync_failed' }, { status: 503 })
    }
}))
