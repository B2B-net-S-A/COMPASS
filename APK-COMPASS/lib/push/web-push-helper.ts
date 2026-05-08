/**
 * H3.3: Web Push helper — VAPID setup + send wrapper.
 *
 * Wymaga env vars:
 *   - VAPID_PUBLIC_KEY (browser-side)
 *   - VAPID_PRIVATE_KEY (server-only)
 *   - VAPID_SUBJECT ("mailto:admin@dynaminds.pl")
 *
 * Generuj raz: `npx web-push generate-vapid-keys` → save w Coolify env vault.
 */

import webpush, { type PushSubscription } from 'web-push'

let initialized = false

function ensureInitialized(): boolean {
    if (initialized) return true
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@dynaminds.pl'
    if (!publicKey || !privateKey) {
        console.warn('[web-push] VAPID keys not configured — push disabled')
        return false
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)
    initialized = true
    return true
}

export interface PushSubscriptionRecord {
    id: string
    endpoint: string
    p256dh: string
    auth: string
}

export interface PushPayload {
    title: string
    body: string
    icon?: string
    badge?: string
    url?: string
    tag?: string
}

/**
 * Wysyła push do pojedynczej subscription.
 * Zwraca status — kod 410/404 sygnalizuje że subscription wygasła i należy ją usunąć.
 */
export async function sendWebPush(
    sub: PushSubscriptionRecord,
    payload: PushPayload,
): Promise<{ success: boolean; gone?: boolean; error?: string }> {
    if (!ensureInitialized()) {
        return { success: false, error: 'VAPID not configured' }
    }
    try {
        const subscription: PushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
            },
        }
        await webpush.sendNotification(
            subscription,
            JSON.stringify({
                title: payload.title,
                body: payload.body,
                icon: payload.icon ?? '/compass_icon_192.png',
                badge: payload.badge ?? '/compass_icon_192.png',
                url: payload.url ?? '/',
                tag: payload.tag ?? 'compass-notification',
            }),
            {
                TTL: 86400, // 24h
            },
        )
        return { success: true }
    } catch (error: unknown) {
        const errAny = error as { statusCode?: number; message?: string }
        const isGone = errAny.statusCode === 410 || errAny.statusCode === 404
        return {
            success: false,
            gone: isGone,
            error: errAny.message ?? 'Push send failed',
        }
    }
}

/**
 * Wysyła push do wszystkich subscriptions usera.
 * Auto-cleanup: gone subscriptions są flagowane do delete przez caller.
 */
export async function sendPushToUser(
    subs: PushSubscriptionRecord[],
    payload: PushPayload,
): Promise<{ sent: number; failed: number; goneSubIds: string[] }> {
    let sent = 0
    let failed = 0
    const goneSubIds: string[] = []
    for (const sub of subs) {
        const res = await sendWebPush(sub, payload)
        if (res.success) sent += 1
        else {
            failed += 1
            if (res.gone) goneSubIds.push(sub.id)
        }
    }
    return { sent, failed, goneSubIds }
}
