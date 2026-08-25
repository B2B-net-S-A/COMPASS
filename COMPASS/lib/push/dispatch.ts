import 'server-only'

import { logCompat } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    sendPushToUser,
    type PushPayload,
    type PushSubscriptionRecord,
} from '@/lib/push/web-push-helper'

// Audyt 2026-08 (A0.4): ta funkcja mieszkała w lib/actions/push-subscriptions.ts,
// czyli w module z dyrektywą 'use server'. Jej docstring deklarował „Server-only",
// ale KAŻDY eksport z pliku 'use server' jest publicznym endpointem HTTP — Next
// generuje dla niego action ID osiągalne z przeglądarki.
//
// Skutkiem był spoofowany push pod marką COMPASS: funkcja działa service-rolą,
// przyjmuje dowolny userId i dowolny payload, a public/push-sw.js:49 otwiera
// payload.url przez clients.openWindow() — czyli dowolny adres.
//
// Wzorzec naprawy jest w tym repo ustalony: helpery współdzielone przez akcje
// i crony żyją POZA granicą server-action (lib/notifications/alert-dispatch.ts,
// lib/mailbox/forward-rule-sync.ts, lib/contractors/import-core.ts).
// Nie dodawaj tu 'use server' — to cofnęłoby naprawę.

/**
 * Wysyła push do wszystkich subskrypcji użytkownika i sprząta wygasłe (410 Gone).
 * Bezpieczne wywołanie nawet gdy VAPID nie jest skonfigurowane (no-op).
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
