import 'server-only'

import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { hashPulseToken } from '@/lib/consultant-success/pulse-token'
import { areConsultantSuccessSurveysEnabled } from '@/lib/consultant-success/flags'

export const PULSE_UNAVAILABLE_MESSAGE = 'Ten link jest nieważny, wygasł albo ankieta została już wysłana.'

function pulseDb() {
    // The generated Database type is refreshed only after the migration is applied.
    // Keep this narrow cast local so the rest of the application remains strictly typed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createServiceClient() as any
}

export async function isPulseTokenAvailable(token: string): Promise<boolean> {
    if (!areConsultantSuccessSurveysEnabled()) return false
    if (!token || token.length < 32 || token.length > 256) return false

    const db = pulseDb()
    const { data, error } = await db
        .from('contractor_pulse_requests')
        .select('id')
        .eq('token_hash', hashPulseToken(token))
        .eq('status', 'sent')
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle()

    if (error) {
        logger.error({ event: 'consultant_success.pulse.lookup_failed', error: error.message })
        return false
    }
    return Boolean(data?.id)
}

export async function consumePulseRateLimit(input: {
    token: string
    ipAddress: string
}): Promise<boolean> {
    if (!areConsultantSuccessSurveysEnabled()) return false
    const hourBucket = new Date().toISOString().slice(0, 13)
    const pepper = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'compass-pulse'
    const tokenHash = hashPulseToken(input.token)
    const ipHash = createHash('sha256').update(input.ipAddress || 'unknown').digest('hex')
    const bucketKey = createHash('sha256')
        .update(`${tokenHash}:${ipHash}:${hourBucket}:${pepper}`)
        .digest('hex')

    const db = pulseDb()
    const { data, error } = await db.rpc('consume_contractor_pulse_rate_limit', {
        p_bucket_key: bucketKey,
        p_max_attempts: 10,
        p_window_minutes: 60,
    })
    if (error) {
        // Fail closed for this public endpoint. A broken limiter must not expose an
        // unlimited write path to an HR-data workflow.
        logger.error({ event: 'consultant_success.pulse.rate_limit_failed', error: error.message })
        return false
    }
    return data === true
}

export async function submitPulseResponse(input: {
    token: string
    satisfactionScore: number
    engagementScore: number
    recommendationScore: number
    note: string | null
}): Promise<boolean> {
    if (!areConsultantSuccessSurveysEnabled()) return false
    const db = pulseDb()
    const tokenHash = hashPulseToken(input.token)
    const { data, error } = await db.rpc('submit_contractor_pulse_response', {
        p_token_hash: tokenHash,
        p_satisfaction: input.satisfactionScore,
        p_engagement: input.engagementScore,
        p_recommendation: input.recommendationScore,
        p_note: input.note,
    })
    if (error) {
        logger.warn({ event: 'consultant_success.pulse.submit_rejected', error: error.message })
        return false
    }
    // submit_contractor_pulse_response writes its audit row inside the same
    // transaction as the immutable response.
    return data === true
}
