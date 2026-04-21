'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from './actions/audit'

// Helper to generate a 6-digit code
function generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function sendMFACode(userId: string, email: string) {
    const supabase = createClient()
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    // 1. Store code in DB
    const { error } = await supabase.from('verification_codes').insert({
        user_id: userId,
        code,
        type: 'MFA',
        expires_at: expiresAt.toISOString()
    })

    if (error) {
        console.error('Error storing MFA code:', error)
        return { error: 'Błąd generowania kodu MFA' }
    }

    // 2. Send Email (Mocked for now, or use Supabase Mailer if available)
    // In a real app, this would use Resend/SendGrid/Supabase Auth's email
    // MFA code sent to email (code logged only in development)
    if (process.env.NODE_ENV === 'development') {
        console.log(`[MFA] Code for ${email}: ${code}`)
    }

    // Log the event
    await logAudit(userId, 'MFA_SENT', { email })

    return { success: true }
}

export async function verifyMFACode(userId: string, code: string) {
    const supabase = createClient()

    // 1. Check if code exists, is valid, and not expired
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

    // 2. Mark as used
    await supabase
        .from('verification_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', data.id)

    await logAudit(userId, 'MFA_VERIFY', { success: true })

    return { success: true }
}
