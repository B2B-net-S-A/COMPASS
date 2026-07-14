import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { logger } from '@/lib/logger'
import { runConsultantSuccessPlanner } from '@/lib/consultant-success/planner'
import {
    markJobFailed,
    markJobStarted,
    markJobSucceeded,
} from '@/lib/consultant-success/job-state'
import { parseBooleanEnv } from '@/lib/consultant-success/scheduling'
import type { SuccessAdminClient } from '@/lib/consultant-success/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const JOB_NAME = 'consultant_success_plan'

export const GET = withCronAuth(async (request, { admin: typedAdmin }) => {
    const enabled = parseBooleanEnv(process.env.CONSULTANT_SUCCESS_ENABLED)
    const automationsEnabled = parseBooleanEnv(process.env.CONSULTANT_SUCCESS_AUTOMATIONS_ENABLED)
    if (!enabled || !automationsEnabled) {
        return NextResponse.json({
            ok: true,
            skipped: 'disabled',
            featureEnabled: enabled,
            automationsEnabled,
        })
    }

    const admin = typedAdmin as SuccessAdminClient
    const url = new URL(request.url)
    const shadowMode = parseBooleanEnv(process.env.CONSULTANT_SUCCESS_SHADOW_MODE)
        || url.searchParams.get('shadow') === '1'
    const startedAt = new Date()
    try {
        await markJobStarted(admin, JOB_NAME, startedAt)
        const stats = await runConsultantSuccessPlanner({ admin, shadowMode })
        await markJobSucceeded(admin, JOB_NAME, { ...stats }, new Date())
        logger.info({ event: 'consultant_success.plan.done', ...stats })
        return NextResponse.json({ ok: true, ...stats })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error'
        await markJobFailed(admin, JOB_NAME, error).catch((stateError) => {
            logger.error({ event: 'consultant_success.plan.job_state_failed', error: stateError })
        })
        logger.error({ event: 'consultant_success.plan.exception', error })
        Sentry.captureException(error, { tags: { kind: JOB_NAME } })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
})
