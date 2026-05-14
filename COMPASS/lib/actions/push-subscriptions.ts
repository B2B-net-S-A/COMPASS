'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    sendPushToUser,
    type PushPayload,
    type PushSubscriptionRecord,
} from '@/lib/push/web-push-helper'

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
 * Wysyła push do wszystkich subscriptions usera + cleanup gone subscriptions.
 * Server-only — używane przez triggery (np. po approveLeaveRequest).
 *
 * Bezpieczne wywołanie nawet gdy VAPID nie skonfigurowane (no-op).
 */
export async function sendPushToUserId(
    userId: string,
    payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
    try {
        const admin = createServiceClient()
        const { data: subs } = await admin
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', userId)
        const subsList = (subs ?? []) as PushSubscriptionRecord[]
        if (subsList.length === 0) return { sent: 0, failed: 0 }

        const result = await sendPushToUser(subsList, payload)

        // Cleanup gone subs
        if (result.goneSubIds.length > 0) {
            await admin.from('push_subscriptions').delete().in('id', result.goneSubIds)
        }

        // Update last_used_at na sub które zadziałały
        if (result.sent > 0) {
            const goneSet = new Set(result.goneSubIds)
            const succeededIds = subsList.filter((s) => !goneSet.has(s.id)).map((s) => s.id)
            if (succeededIds.length > 0) {
                await admin
                    .from('push_subscriptions')
                    .update({ last_used_at: new Date().toISOString() })
                    .in('id', succeededIds)
            }
        }

        return { sent: result.sent, failed: result.failed }
    } catch (error: unknown) {
        logCompat.error('[sendPushToUserId]', error)
        return { sent: 0, failed: 0 }
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
            title: 'ComPass — test',
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
