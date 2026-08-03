import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { sweepBlockAssignments } from '@/lib/tech-map/rotation-sweep'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Phase 46 (Etap 2) — dzienne przemiatanie przydziałów bloków wywiadu.
 *
 * Nadaje brakujące przydziały B/C/D na BIEŻĄCY kwartał każdemu aktywnemu
 * kontraktorowi, żeby TCM widział blok przed rozmową, a nie dopiero po zapisaniu
 * pierwszej karty. Idempotentne — kontraktor z przydziałem (auto lub ręcznym)
 * jest pomijany, więc ręczny override admina jest lepki.
 *
 * Dzienny, nie kwartalny: kontraktorzy aktywują się w środku kwartału, a crony
 * Coolify potrafią nie odpalić (patrz historia inbox-ingest/tc-sync) — dzienny
 * przebieg sam nadrabia zaległości bez ręcznej interwencji.
 *
 * Coolify cron: `30 5 * * *` (05:30 UTC daily).
 *
 * Ślad w bazie: audit_logs `TECH_MAP_ROTATION_RUN` (phase start/done) — jedyny
 * czytelny bez CRON_SECRET dowód, że zadanie się wykonało. `start` bez `done`
 * = przebieg ubity w locie; brak `start` = cron w ogóle nie odpalił.
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    try {
        const stats = await sweepBlockAssignments(admin)

        if (stats.assigned > 0) {
            revalidatePath('/internal/people')
        }
        if (stats.errors.length > 0) {
            Sentry.captureMessage('tech_map_rotation_partial_failure', {
                level: 'warning',
                tags: { kind: 'cron_tech_map_rotation' },
            })
        }

        logger.info({ event: 'tech_map_rotation.done', ...stats })
        return NextResponse.json({ ok: stats.errors.length === 0, ...stats })
    } catch (error) {
        // withCronAuth nie łapie wyjątków — bez tego runtime zwróciłby gołe 500
        // bez śladu w Sentry (lekcja z oof-reconcile).
        Sentry.captureException(error)
        const message = error instanceof Error ? error.message : String(error)
        logger.error({ event: 'tech_map_rotation.failed', error: message })
        return NextResponse.json({ ok: false, stage: 'sweep', error: message })
    }
})
