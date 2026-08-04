// Phase 46c — alerty mapy technologicznej: odbiorcy + dispatch 3-kanałowy (I/O).
// Plain module (NIE 'use server'), ale ciągnie server-only (admin client) i
// use-server (push) — NIE importować z komponentu klienckiego ani testu. Czyste
// helpery (selekcja, parsowanie, deadline) są w alert-selection.ts (testowalne).

import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import { logger } from '@/lib/logger'
import type { createServiceClient } from '@/lib/supabase/admin'

type ServiceClient = ReturnType<typeof createServiceClient>

// Re-eksport czystych helperów, żeby konsumenci mieli jedno źródło importu.
export {
    DEMAND_RECIPIENTS_KEY,
    PROJECT_END_RECIPIENTS_KEY,
    PROJECT_END_ALERT_DAYS,
    parseRecipientCsv,
    projectEndDeadline,
    selectProjectEndAlerts,
    type ProjectEndCard,
    type ProjectEndAlert,
} from './alert-selection'
import { parseRecipientCsv } from './alert-selection'

// ─── Odbiorcy ────────────────────────────────────────────────────────────────

/**
 * Odbiorcy alertu: z system_settings (CSV UUID) jeśli ustawione; inaczej
 * fallback (owner_tcm_id kontraktora, a jak brak — wszyscy admin+TCM).
 * Wzorzec z contractor-followup-reminder.
 */
export async function resolveRecipients(
    admin: ServiceClient,
    settingKey: string,
    fallbackUserIds: string[],
): Promise<string[]> {
    const { data } = await admin
        .from('system_settings')
        .select('value')
        .eq('key', settingKey)
        .maybeSingle()
    const configured = parseRecipientCsv((data as { value?: string } | null)?.value ?? null)
    if (configured.length > 0) return configured
    return Array.from(new Set(fallbackUserIds.filter(Boolean)))
}

/** Wszyscy admin + talent_community (poza exited) — ostateczny fallback. */
export async function allTcmAndAdmins(admin: ServiceClient): Promise<string[]> {
    const { data } = await admin
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'talent_community'])
        .neq('employment_status', 'exited')
    return ((data ?? []) as Array<{ id: string }>).map((p) => p.id)
}

// ─── Dispatch 3-kanałowy ─────────────────────────────────────────────────────

export interface AlertPayload {
    type: 'tech_map_demand' | 'tech_map_project_end'
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
 * Wysyła alert do odbiorców trzema kanałami (in-app insert + push + email),
 * każdy w Promise.allSettled — awaria kanału jest logowana, nie rzuca.
 * Zwraca liczbę faktycznie powiadomionych odbiorców (in-app).
 */
export async function dispatchAlert(
    admin: ServiceClient,
    recipientIds: string[],
    payload: AlertPayload,
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

        const inApp = admin.from('notifications').insert({
            user_id: uid,
            type: payload.type,
            title_pl: payload.titlePl,
            title_en: payload.titleEn,
            body_pl: payload.bodyPl,
            body_en: payload.bodyEn,
            action_url: payload.actionUrl,
            priority: 'normal',
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
                    event: 'tech_map.alert.channel_failed',
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
