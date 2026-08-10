// Phase 50 — generyczny dispatcher alertów 3-kanałowych (in-app + push + email).
//
// Wyciągnięty z lib/tech-map/alerts.ts (Phase 46c), bo monitoring prawny
// potrzebuje dokładnie tego samego zachowania. Zachowanie jest identyczne —
// zmienił się tylko `type` (było wąskie unie tech-mapy, jest string, bo każdy
// moduł ma własne typy z `notifications_type_check`) i nazwa zdarzenia w logu,
// która przyjmuje teraz prefiks modułu zamiast twardego „tech_map".
//
// Plain module (NIE 'use server'), ale ciągnie server-only (admin client) i
// use-server (push) — NIE importować z komponentu klienckiego ani testu.

import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import { logger } from '@/lib/logger'
import type { createServiceClient } from '@/lib/supabase/admin'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface GenericAlertPayload {
    /** Musi być wartością z `notifications_type_check`, inaczej insert odbije się o CHECK. */
    type: string
    titlePl: string
    titleEn: string
    bodyPl: string
    bodyEn: string
    actionUrl: string
    pushTag: string
    /** Email per odbiorca; recipient bez emaila jest pomijany na kanale email. */
    emailFn: (email: string, name: string) => Promise<{ success: boolean }>
}

/**
 * Odbiorcy alertu: z `system_settings` (CSV UUID) jeśli ustawione; inaczej fallback.
 * Wzorzec z contractor-followup-reminder.
 */
export async function resolveAlertRecipients(
    admin: ServiceClient,
    settingKey: string,
    fallbackUserIds: string[],
    parseCsv: (raw: string | null | undefined) => string[],
): Promise<string[]> {
    const { data } = await admin
        .from('system_settings')
        .select('value')
        .eq('key', settingKey)
        .maybeSingle()
    const configured = parseCsv((data as { value?: string } | null)?.value ?? null)
    if (configured.length > 0) return configured
    return Array.from(new Set(fallbackUserIds.filter(Boolean)))
}

/**
 * Wysyła alert do odbiorców trzema kanałami, każdy w Promise.allSettled — awaria
 * kanału jest logowana, nie rzuca. Zwraca liczbę odbiorców, do których poszła próba.
 */
export async function dispatchGenericAlert(
    admin: ServiceClient,
    recipientIds: string[],
    payload: GenericAlertPayload,
    logEvent: string,
): Promise<number> {
    const ids = Array.from(new Set(recipientIds.filter(Boolean)))
    if (ids.length === 0) return 0

    const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', ids)
    const byId = new Map(
        ((profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map(
            (p) => [p.id, p],
        ),
    )

    let notified = 0
    for (const uid of ids) {
        const profile = byId.get(uid)

        // supabase-js v2 nie rejectuje — resolwuje {error}. Bez tego .then() błąd
        // insertu byłby „fulfilled" i kanał in_app nigdy nie trafiłby do logu awarii.
        const inApp = admin
            .from('notifications')
            .insert({
                user_id: uid,
                type: payload.type,
                title_pl: payload.titlePl,
                title_en: payload.titleEn,
                body_pl: payload.bodyPl,
                body_en: payload.bodyEn,
                action_url: payload.actionUrl,
                priority: 'normal',
            })
            .then(({ error }) => {
                if (error) throw new Error(error.message)
                return { ok: true }
            })

        const push = sendPushToUserId(uid, {
            title: payload.titlePl,
            body: payload.bodyPl,
            url: payload.actionUrl,
            tag: payload.pushTag,
        }).catch(() => ({ sent: 0, failed: 1 }))

        const email = profile?.email
            ? payload.emailFn(profile.email, profile.full_name ?? 'Zespół')
            : Promise.resolve({ success: false })

        const results = await Promise.allSettled([inApp, push, email])
        const channels = ['in_app', 'push', 'email'] as const
        results.forEach((r, idx) => {
            if (r.status === 'rejected') {
                logger.error({
                    event: logEvent,
                    channel: channels[idx],
                    type: payload.type,
                    user_id: uid,
                    error: r.reason instanceof Error ? r.reason.message : String(r.reason),
                })
            }
        })
        notified += 1
    }
    return notified
}
