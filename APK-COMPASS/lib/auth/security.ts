'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15

export async function checkRateLimit(email: string): Promise<{ allowed: boolean; remaining: number }> {
    const supabase = createClient()
    const headerStore = headers()
    void headerStore.get('x-forwarded-for') // reserved for future ip-based limit

    const timeWindow = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

    // Count failed attempts in the last window
    const { count, error } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('email', email)
        // .eq('ip_address', ip) // Limit by Email AND IP? Spec says "na adres e-mail" (per email address)
        .eq('success', false)
        .gt('attempt_time', timeWindow)

    if (error) {
        console.error('Rate limit check failed:', error)
        return { allowed: true, remaining: MAX_ATTEMPTS } // Fail open if DB error? Or fail closed? Fail open is safer for UX, but risky.
    }

    const attempts = count || 0
    const remaining = Math.max(0, MAX_ATTEMPTS - attempts)

    return {
        allowed: attempts < MAX_ATTEMPTS,
        remaining
    }
}

export async function logLoginAttempt(email: string, success: boolean) {
    const supabase = createClient()
    const headerStore = headers()
    const ip = headerStore.get('x-forwarded-for') || 'unknown'

    await supabase.from('login_attempts').insert({
        email,
        ip_address: ip,
        success,
        attempt_time: new Date().toISOString()
    })
}
