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

import { sendPushToUserId } from '@/lib/push/dispatch'
import { activeRoster } from '@/lib/hr/employment-window'
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
 *
 * Audyt 2026-08: lista to zwykły tekst w tabeli klucz-wartość — nie ma i nie może
 * mieć klucza obcego, więc UUID nie znika, kiedy człowiek odchodzi z firmy. Bez
 * sprawdzenia alert szedł do konta ZARCHIWIZOWANEGO (które od Fazy 43 nie może
 * się nawet zalogować), a wpis UUID-a nieistniejącego odbijał się o klucz obcy
 * `notifications` gdzieś w środku wysyłki. Dlatego skonfigurowaną listę
 * konfrontujemy z `profiles`: zostają tylko konta istniejące i nie-`exited`.
 *
 * Gdy po tym filtrze nie zostaje nikt, wracamy do fallbacku (właściciel sprawy /
 * wszyscy admini) — alert ma dojść do KOGOŚ. Odsiane UUID-y lądują w logu, bo
 * cicha korekta listy odbiorców to dokładnie ten rodzaj zmiany, którego nikt
 * później nie umie wytłumaczyć.
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

    if (configured.length > 0) {
        const { data: rows, error } = await admin
            .from('profiles')
            .select('id, employment_status')
            .in('id', configured)

        // Nie udało się sprawdzić = nie zgadujemy. Lepiej wysłać wg konfiguracji
        // niż wyciszyć alert z powodu chwilowej awarii odczytu.
        if (error) return configured

        const usable = activeRoster(
            (rows ?? []) as Array<{ id: string; employment_status: string | null }>,
        ).map((p) => p.id)
        const usableSet = new Set(usable)
        const dropped = configured.filter((id) => !usableSet.has(id))
        if (dropped.length > 0) {
            logger.warn({
                event: 'alerts.recipients.dropped',
                settingKey,
                dropped,
                msg: 'UUID z system_settings nie wskazuje na aktywny profil — pomijam',
            })
        }
        if (usable.length > 0) return usable
    }

    return Array.from(new Set(fallbackUserIds.filter(Boolean)))
}

export interface AlertDispatchResult {
    /** Odbiorcy, do których poszła próba. */
    attempted: number
    /**
     * Odbiorcy, do których alert faktycznie dotarł TRWAŁYM kanałem (dzwonek lub email).
     *
     * Push jest z założenia best-effort (brak subskrypcji = cisza, a `.catch` niżej
     * zamienia awarię w rozwiązaną obietnicę), więc sam z siebie nie liczy się jako
     * dostarczenie — inaczej alert „dostarczony" mógłby nie zostawić po sobie nic,
     * co da się później zobaczyć.
     */
    delivered: number
}

/**
 * Wysyła alert do odbiorców trzema kanałami, każdy w Promise.allSettled — awaria
 * kanału jest logowana, nie rzuca.
 *
 * Audyt 2026-08 (C11.2): funkcja zwracała samą liczbę PRÓB, a wołający brał ją (albo
 * sam brak wyjątku) za dowód dostarczenia i stemplował dedup `alerted_at`/`reminded_at`.
 * Nieudany alert nigdy się więc nie ponawiał — cisza wyglądała identycznie jak sukces.
 * Stąd rozdzielenie `attempted` / `delivered`: stempluj wyłącznie po `delivered > 0`.
 */
export async function dispatchGenericAlert(
    admin: ServiceClient,
    recipientIds: string[],
    payload: GenericAlertPayload,
    logEvent: string,
): Promise<AlertDispatchResult> {
    const ids = Array.from(new Set(recipientIds.filter(Boolean)))
    if (ids.length === 0) return { attempted: 0, delivered: 0 }

    const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', ids)
    const byId = new Map(
        ((profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map(
            (p) => [p.id, p],
        ),
    )

    let attempted = 0
    let delivered = 0
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

        const [inAppResult, , emailResult] = results
        const inAppOk = inAppResult.status === 'fulfilled'
        // Wysyłka maila NIE rzuca przy porażce — zwraca `{ success: false }`. Sam
        // `fulfilled` nic więc nie mówi; liczy się dopiero flaga w wyniku.
        const emailOk = emailResult.status === 'fulfilled' && emailResult.value.success === true

        attempted += 1
        if (inAppOk || emailOk) delivered += 1
        else {
            logger.error({
                event: logEvent,
                channel: 'all',
                type: payload.type,
                user_id: uid,
                error: 'żaden trwały kanał nie dostarczył alertu',
            })
        }
    }
    return { attempted, delivered }
}
