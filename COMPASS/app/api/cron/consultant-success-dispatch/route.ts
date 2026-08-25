import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { logger } from '@/lib/logger'
import { runConsultantSuccessDispatcher } from '@/lib/consultant-success/dispatcher'
import {
    markJobFailed,
    markJobStarted,
    markJobSucceeded,
} from '@/lib/consultant-success/job-state'
import { parseBooleanEnv } from '@/lib/consultant-success/scheduling'
import type { SuccessAdminClient } from '@/lib/consultant-success/types'

export const dynamic = 'force-dynamic'
// UWAGA: `maxDuration` jest tu MARTWE. Next 14.2 czyta ten eksport przy buildzie i
// tłumaczy go na limit funkcji serverless (Vercel/Lambda); w kontenerze na Coolify nikt
// go nie egzekwuje, więc nie jest to działająca ochrona przed zawieszonym przebiegiem.
// Zostaje jako deklaracja intencji na wypadek zmiany hostingu — realnym limitem jest
// timeout per żądanie na proxy (Traefik/Cloudflare) i limity samych wywołań.
export const maxDuration = 240

const JOB_NAME = 'consultant_success_dispatch'

export const GET = withCronAuth(async (request, { admin: typedAdmin }) => {
    const enabled = parseBooleanEnv(process.env.CONSULTANT_SUCCESS_ENABLED)
    const automationsEnabled = parseBooleanEnv(process.env.CONSULTANT_SUCCESS_AUTOMATIONS_ENABLED)
    const shadowMode = parseBooleanEnv(process.env.CONSULTANT_SUCCESS_SHADOW_MODE)
    if (!enabled || !automationsEnabled || shadowMode) {
        return NextResponse.json({
            ok: true,
            skipped: shadowMode ? 'shadow_mode' : 'disabled',
            featureEnabled: enabled,
            automationsEnabled,
            shadowMode,
        })
    }

    const admin = typedAdmin as SuccessAdminClient
    const url = new URL(request.url)
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50)
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50
    const workerId = `consultant-success-${randomUUID()}`
    const startedAt = new Date()
    try {
        await markJobStarted(admin, JOB_NAME, startedAt)
        const stats = await runConsultantSuccessDispatcher({ admin, workerId, limit })
        await markJobSucceeded(admin, JOB_NAME, { ...stats }, new Date())
        logger.info({ event: 'consultant_success.dispatch.done', ...stats })
        if (stats.dead > 0 || stats.errors > 0) {
            Sentry.captureMessage('consultant_success_dispatch_partial_failure', {
                level: stats.dead > 0 ? 'error' : 'warning',
                tags: { kind: JOB_NAME },
                extra: { dead: stats.dead, errors: stats.errors, claimed: stats.claimed },
            })
        }
        return NextResponse.json({ ok: true, ...stats })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error'
        await markJobFailed(admin, JOB_NAME, error).catch((stateError) => {
            logger.error({ event: 'consultant_success.dispatch.job_state_failed', error: stateError })
        })
        logger.error({ event: 'consultant_success.dispatch.exception', error })
        Sentry.captureException(error, { tags: { kind: JOB_NAME } })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
})
