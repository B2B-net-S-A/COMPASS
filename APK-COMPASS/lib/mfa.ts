'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { logAudit } from './actions/audit'
import { logger } from './logger'
import { MFA_CODE_DIGITS, MFA_CODE_VALIDITY_MINUTES } from '@/lib/constants/auth'

function generateCode(): string {
    // Generuje N-cyfrowy kod (default 6) jako string z padding zerami.
    const max = Math.pow(10, MFA_CODE_DIGITS)
    return String(Math.floor(Math.random() * max)).padStart(MFA_CODE_DIGITS, '0')
}

// verification_codes has RLS enabled with no policies (Phase 18.1 — security
// hardening). MFA codes are plaintext and sensitive; exposing the table via
// the anon-key client would allow account takeover by reading other users'
// codes. Service-role client bypasses RLS and is the only safe access path.
export async function sendMFACode(userId: string, email: string) {
    const supabase = createServiceClient()
    const code = generateCode()
    const expiresAt = new Date(Date.now() + MFA_CODE_VALIDITY_MINUTES * 60 * 1000)

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
