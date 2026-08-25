'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { sendPushToUserId } from '@/lib/push/dispatch'

// ============================================================
// H3.3 — Push Subscription server actions
// ============================================================

interface SubscribePushInput {
    endpoint: string
    p256dh: string
    auth: string
    userAgent?: string
}

/**
 * Zapisuje (lub odświeża) push subscription dla usera.
 * Idempotent: gdy endpoint już istnieje, refresh keys + last_used_at.
 */
export async function subscribePush(
    input: SubscribePushInput,
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // Upsert by endpoint (UNIQUE constraint)
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert(
                {
                    user_id: user.id,
                    endpoint: input.endpoint,
                    p256dh: input.p256dh,
                    auth: input.auth,
                    user_agent: input.userAgent ?? null,
                    last_used_at: new Date().toISOString(),
                },
                { onConflict: 'endpoint' },
            )
        if (error) throw error
        return { success: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zapisu subscription'
        logCompat.error('[subscribePush]', error)
        return { success: false, error: msg }
    }
}

/**
 * Odsubskrybuj — delete by endpoint.
 */
export async function unsubscribePush(endpoint: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint)
            .eq('user_id', user.id)
        if (error) throw error
        return { success: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd unsubscribe'
        logCompat.error('[unsubscribePush]', error)
        return { success: false, error: msg }
    }
}

/**
 * Test endpoint dla user — wysyła testowy push do swoich subscriptions.
 */
export async function sendTestPush(): Promise<{
    success: boolean
    sent?: number
    error?: string
}> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const result = await sendPushToUserId(user.id, {
            title: 'COMPASS — test',
            body: 'Push notifications działają! 🎉',
            url: '/',
            tag: 'test',
        })
        return { success: true, sent: result.sent }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd test push'
        return { success: false, error: msg }
    }
}
