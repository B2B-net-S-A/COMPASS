'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { logger } from '@/lib/logger'

const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15

// login_attempts has RLS enabled with no policies (Phase 18.1 — security hardening).
// We must use the service_role client to read/write rate-limit data; the anon-key
// client would be denied by RLS. This is intentional: only the server-side login
// flow should ever touch this table, and exposing it via REST/anon was a leak risk
// (anyone could enumerate email addresses by polling failed-attempt counts).
export async function checkRateLimit(email: string): Promise<{ allowed: boolean; remaining: number }> {
    const supabase = createServiceClient()
    const headerStore = headers()
    void headerStore.get('x-forwarded-for') // reserved for future ip-based limit

    const timeWindow = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

    const { count, error } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('email', email)
        .eq('success', false)
        .gt('attempt_time', timeWindow)

    if (error) {
        logger.error({ event: 'auth.rate_limit.check_failed', error, email })
        // Fail open: a DB error should not lock everyone out. Mitigated by the
        // fact that login itself still goes through Supabase Auth which has its
        // own (separate) brute-force protection.
        return { allowed: true, remaining: MAX_ATTEMPTS }
    }

    const attempts = count || 0
    const remaining = Math.max(0, MAX_ATTEMPTS - attempts)

    return {
        allowed: attempts < MAX_ATTEMPTS,
        remaining,
    }
}

export async function logLoginAttempt(email: string, success: boolean) {
    const supabase = createServiceClient()
    const headerStore = headers()
    const ip = headerStore.get('x-forwarded-for') || 'unknown'

    const { error } = await supabase.from('login_attempts').insert({
        email,
        ip_address: ip,
        success,
        attempt_time: new Date().toISOString(),
    })

    if (error) {
        logger.error({ event: 'auth.login_attempt.insert_failed', error, email, success })
    }
}
