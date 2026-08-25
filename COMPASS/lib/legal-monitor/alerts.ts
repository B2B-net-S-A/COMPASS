// Phase 50 — monitoring prawny: odbiorcy + wysyłka alertów (I/O).
//
// Czysta selekcja („o czym alertować") jest w alert-selection.ts. Tutaj tylko
// rozwiązanie odbiorców i wysyłka wspólnym dispatcherem — ten sam podział co
// w tech-mapie.
//
// Plain module (NIE 'use server') — ciągnie admin client i push.

import {
    dispatchGenericAlert,
    resolveAlertRecipients,
    type AlertDispatchResult,
    type GenericAlertPayload,
} from '@/lib/notifications/alert-dispatch'
import type { createServiceClient } from '@/lib/supabase/admin'
import { excludeExited } from '@/lib/hr/employment-window'

type ServiceClient = ReturnType<typeof createServiceClient>

const LOG_EVENT = 'legal_monitor.alert.channel_failed'

export const LEGAL_MONITOR_URL = '/internal/admin?tab=legal-monitor'

/** CSV UUID → lista id. Ten sam format co pozostałe klucze `system_settings`. */
export function parseRecipientCsv(raw: string | null | undefined): string[] {
    if (!raw) return []
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
}

/**
 * Ostateczny fallback: wszyscy finanse + admin (poza zarchiwizowanymi).
 * Zarchiwizowani nie mają dostępu do aplikacji od Phase 43, więc alert do nich
 * byłby wysłany donikąd.
 */
export async function allFinanseAndAdmins(admin: ServiceClient): Promise<string[]> {
    const { data } = await excludeExited(
        admin.from('profiles').select('id').in('role', ['admin', 'finanse']),
    )
    return ((data ?? []) as Array<{ id: string }>).map((p) => p.id)
}

export async function resolveRecipients(
    admin: ServiceClient,
    settingKey: string,
    fallbackUserIds: string[],
): Promise<string[]> {
    return resolveAlertRecipients(admin, settingKey, fallbackUserIds, parseRecipientCsv)
}

/**
 * Zwraca `{ attempted, delivered }`. Stempel dedupu (`alerted_at` / `reminded_at`,
 * marker ciszy) MUSI zależeć od `delivered` — patrz audyt 2026-08 (C11.2).
 */
export async function dispatchLegalMonitorAlert(
    admin: ServiceClient,
    recipientIds: string[],
    payload: GenericAlertPayload,
): Promise<AlertDispatchResult> {
    return dispatchGenericAlert(admin, recipientIds, payload, LOG_EVENT)
}
