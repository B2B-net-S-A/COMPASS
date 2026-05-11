'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { logAudit } from './actions/audit'
import { logger } from './logger'

function generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

// verification_codes has RLS enabled with no policies (Phase 18.1 — security
// hardening). MFA codes are plaintext and sensitive; exposing the table via
// the anon-key client would allow account takeover by reading other users'
// codes. Service-role client bypasses RLS and is the only safe access path.
export async function sendMFACode(userId: string, email: string) {
    const supabase = createServiceClient()
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    const { error } = await supabase.from('verification_codes').insert({
        user_id: userId,
        code,
        type: 'MFA',
        expires_at: expiresAt.toISOString(),
    })

    if (error) {
        logger.error({ event: 'mfa.code.store_failed', error, userId })
        return { error: 'Błąd generowania kodu MFA' }
    }

    if (process.env.NODE_ENV === 'development') {
        logger.info({ event: 'mfa.code.dev_log', email, code })
    }

    await logAudit(userId, 'MFA_SENT', { email })

    return { success: true }
}

export async function verifyMFACode(userId: string, code: string) {
    const supabase = createServiceClient()

    const { data, error } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('code', code)
        .eq('type', 'MFA')
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
        .single()

    if (error || !data) {
        await logAudit(userId, 'MFA_VERIFY', { success: false, reason: 'Invalid or expired code' })
        return { error: 'Nieprawidłowy lub przeterminowany kod.' }
    }

    await supabase
        .from('verification_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', data.id)

    await logAudit(userId, 'MFA_VERIFY', { success: true })

    return { success: true }
}
