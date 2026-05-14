'use client'

import { logCompat } from '@/lib/logger'

import { useCallback, useEffect, useState } from 'react'
import { subscribePush, unsubscribePush } from '@/lib/actions/push-subscriptions'

// ============================================================
// H3.3: usePushSubscription hook
// Manages permission + service worker registration + subscribe/unsubscribe.
// ============================================================

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

interface UsePushSubscriptionReturn {
    permission: PushPermissionState
    isSubscribed: boolean
    isLoading: boolean
    /** Prosi o pozwolenie + rejestruje SW + subskrybuje + zapisuje na serwerze. */
    subscribe: () => Promise<{ success: boolean; error?: string }>
    /** Usuwa subscription (browser + server). */
    unsubscribe: () => Promise<{ success: boolean; error?: string }>
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    // Allocate a non-shared ArrayBuffer (PushManager.subscribe requires non-Shared buffer)
    const buffer = new ArrayBuffer(raw.length)
    const arr = new Uint8Array(buffer)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    return arr as Uint8Array<ArrayBuffer>
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
    if (!buffer) return ''
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
}

export function usePushSubscription(): UsePushSubscriptionReturn {
    const [permission, setPermission] = useState<PushPermissionState>('default')
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        async function init() {
            if (typeof window === 'undefined') return
            if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
                if (!cancelled) {
                    setPermission('unsupported')
                    setIsLoading(false)
                }
                return
            }
            const perm = Notification.permission as PushPermissionState
            if (cancelled) return
            setPermission(perm)

            try {
                const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
                if (reg) {
                    const sub = await reg.pushManager.getSubscription()
                    if (!cancelled) setIsSubscribed(!!sub)
                }
            } catch (e) {
                logCompat.warn('[usePushSubscription] init error', e)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        void init()
        return () => {
            cancelled = true
        }
    }, [])

    const subscribe = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
        if (typeof window === 'undefined') return { success: false, error: 'Brak window' }
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return { success: false, error: 'Push nieobsługiwany w tej przeglądarce' }
        }
        const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidPublic) {
            return { success: false, error: 'VAPID public key nie skonfigurowany' }
        }

        setIsLoading(true)
        try {
            // 1. Permission
            const perm = await Notification.requestPermission()
            setPermission(perm as PushPermissionState)
            if (perm !== 'granted') {
                return { success: false, error: 'Nie udzieliłeś zgody na powiadomienia' }
            }

            // 2. Service worker register
            const reg =
                (await navigator.serviceWorker.getRegistration('/push-sw.js')) ??
                (await navigator.serviceWorker.register('/push-sw.js'))
            await navigator.serviceWorker.ready

            // 3. PushManager subscribe
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublic),
            })

            // 4. Save on server
            const subJson = sub.toJSON()
            const result = await subscribePush({
                endpoint: subJson.endpoint ?? sub.endpoint,
                p256dh: subJson.keys?.p256dh ?? arrayBufferToBase64(sub.getKey('p256dh')),
                auth: subJson.keys?.auth ?? arrayBufferToBase64(sub.getKey('auth')),
                userAgent: navigator.userAgent,
            })
            if (!result.success) {
                // Cleanup browser-side jeśli server fail
                await sub.unsubscribe().catch(() => {})
                return { success: false, error: result.error ?? 'Błąd zapisu na serwerze' }
            }

            setIsSubscribed(true)
            return { success: true }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Błąd subskrypcji'
            return { success: false, error: msg }
        } finally {
            setIsLoading(false)
        }
    }, [])

    const unsubscribe = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
        if (typeof window === 'undefined') return { success: false }
        setIsLoading(true)
        try {
            const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
            if (reg) {
                const sub = await reg.pushManager.getSubscription()
                if (sub) {
                    await unsubscribePush(sub.endpoint)
                    await sub.unsubscribe()
                }
            }
            setIsSubscribed(false)
            return { success: true }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Błąd odsubskrybowania'
            return { success: false, error: msg }
        } finally {
            setIsLoading(false)
        }
    }, [])

    return { permission, isSubscribed, isLoading, subscribe, unsubscribe }
}
