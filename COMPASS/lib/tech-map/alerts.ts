// Phase 46c — alerty mapy technologicznej: odbiorcy + dispatch 3-kanałowy (I/O).
// Plain module (NIE 'use server'), ale ciągnie server-only (admin client) i
// use-server (push) — NIE importować z komponentu klienckiego ani testu. Czyste
// helpery (selekcja, parsowanie, deadline) są w alert-selection.ts (testowalne).

import {
    dispatchGenericAlert,
    resolveAlertRecipients,
} from '@/lib/notifications/alert-dispatch'
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
    return resolveAlertRecipients(admin, settingKey, fallbackUserIds, parseRecipientCsv)
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
    return dispatchGenericAlert(admin, recipientIds, payload, 'tech_map.alert.channel_failed')
}
