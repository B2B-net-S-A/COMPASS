'use server'

// Phase 48 — Monitoring prawny: odczyt skrzynki + przegląd wpisów.
//
// Moduł NIE pobiera niczego z internetu. Wpisy dopisuje zewnętrzny pipeline AI
// (zadanie cykliczne, dni robocze ~7:30) ścieżką serwisową; tutaj tylko czytamy
// i obsługujemy workflow przeglądu: new → reviewed | action_required | dismissed.
//
// Auth: wszystko przez requireFinanseOrAdminAction (lustro RLS is_finanse_or_admin()).
//
// Zapis idzie klientem UŻYTKOWNIKA, nie service-role — RLS zostaje wtedy realnym
// backstopem guardu, a nie tylko dekoracją. Lista aktualizowanych kolumn jest
// zawężona w kodzie do czterech pól przeglądu (RLS jest wierszowa, nie kolumnowa,
// więc to app-layer pilnuje, że moduł nie tknie treści wpisu ani dedupe_key).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireFinanseOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sortItemsForReview } from '@/lib/legal-monitor/health'
import type { PublicHolidayDate } from '@/lib/hr/working-days'
import {
    isReviewStatus,
    REVIEW_NOTE_MAX,
    type LegalMonitorItemRow,
    type LegalMonitorReviewStatus,
    type LegalMonitorRunRow,
} from '@/lib/types/legal-monitor'

/** Sufit odczytu skrzynki — filtrowanie robimy po stronie klienta (skala: dziesiątki wpisów). */
const ITEMS_LIMIT = 1000
/** Ile przebiegów pokazujemy w „Historii sprawdzeń". */
const RUNS_LIMIT = 30
/** Okno świąt do oceny zaległości monitoringu (wystarcza na długie weekendy). */
const HOLIDAY_LOOKBACK_DAYS = 30

const HUB_PATH = '/internal/admin'

export interface LegalMonitorReviewInput {
    id: string
    status: LegalMonitorReviewStatus
    note?: string | null
}

export interface LegalMonitorCounts {
    /** Wszystkie wpisy w skrzynce (status = 'new'). */
    newTotal: number
    /** Z tego czerwone — te mogą wymagać decyzji. */
    newRed: number
}

/**
 * Wszystkie wpisy monitoringu, posortowane jak skrzynka do przeglądu
 * (pilność, potem data dokumentu). Nazwiska przeglądających dociągane osobnym
 * zapytaniem — świadomie bez embed-by-FK (patrz nota o PostgREST w CLAUDE.md).
 */
export async function listLegalMonitorItems(): Promise<LegalMonitorItemRow[]> {
    await requireFinanseOrAdminAction()
    const supabase = createClient()

    const { data, error } = await supabase
        .from('legal_monitor_items')
        .select(
            'id, source, source_label, topic, severity, published_at, reference, title, url, summary, why_it_matters, status, reviewed_by, reviewed_at, review_note, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(ITEMS_LIMIT)
    if (error) throw new Error(`Błąd pobierania monitoringu prawnego: ${error.message}`)

    const rows = (data ?? []) as unknown as Array<Omit<LegalMonitorItemRow, 'reviewed_by_name'>>
    if (rows.length === 0) return []

    const reviewerIds = Array.from(
        new Set(rows.map((r) => r.reviewed_by).filter((id): id is string => Boolean(id))),
    )
    const names = new Map<string, string>()
    if (reviewerIds.length > 0) {
        const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', reviewerIds)
        for (const p of (profs ?? []) as Array<{
            id: string
            full_name: string | null
            email: string | null
        }>) {
            names.set(p.id, p.full_name || p.email || '—')
        }
    }

    return sortItemsForReview(
        rows.map((r) => ({
            ...r,
            reviewed_by_name: r.reviewed_by ? (names.get(r.reviewed_by) ?? null) : null,
        })),
    )
}

/** Log przebiegów (heartbeat) — najświeższy pierwszy. Zasila banner i „Historię sprawdzeń". */
export async function listLegalMonitorRuns(limit: number = RUNS_LIMIT): Promise<LegalMonitorRunRow[]> {
    await requireFinanseOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('legal_monitor_runs')
        .select('id, run_at, window_from, status, items_found, sources_checked, notes')
        .order('run_at', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 200)))
    if (error) throw new Error(`Błąd pobierania historii monitoringu: ${error.message}`)
    return (data ?? []) as unknown as LegalMonitorRunRow[]
}

/**
 * Święta z ostatnich ~30 dni — banner musi wiedzieć, czy brak przebiegu wypada
 * w dzień roboczy, czy w święto (wtedy nie alarmujemy).
 */
export async function listRecentHolidays(): Promise<PublicHolidayDate[]> {
    await requireFinanseOrAdminAction()
    const supabase = createClient()
    const from = new Date(Date.now() - HOLIDAY_LOOKBACK_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10)
    const { data } = await supabase
        .from('public_holidays')
        .select('date, name_pl')
        .gte('date', from)
    return (data ?? []) as PublicHolidayDate[]
}

/** Licznik do badge'a przy zakładce — tanio, bez ciągnięcia wierszy. */
export async function countNewLegalMonitorItems(): Promise<LegalMonitorCounts> {
    await requireFinanseOrAdminAction()
    const supabase = createClient()
    const [all, red] = await Promise.all([
        supabase
            .from('legal_monitor_items')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'new'),
        supabase
            .from('legal_monitor_items')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'new')
            .eq('severity', 'red'),
    ])
    return { newTotal: all.count ?? 0, newRed: red.count ?? 0 }
}

/**
 * Oznaczenie wpisu jako przejrzany / do reakcji / odrzucony.
 *
 * Aktualizuje WYŁĄCZNIE cztery kolumny przeglądu — treść wpisu, źródło i
 * `dedupe_key` należą do pipeline'u i moduł ich nie dotyka.
 */
export async function reviewLegalMonitorItem(input: LegalMonitorReviewInput): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()

    const id = (input.id ?? '').trim()
    if (!id) throw new Error('Brak identyfikatora wpisu.')
    if (!isReviewStatus(input.status)) {
        throw new Error('Nieprawidłowy status przeglądu.')
    }

    const note = (input.note ?? '').trim()
    if (note.length > REVIEW_NOTE_MAX) {
        throw new Error(`Notatka jest za długa (max ${REVIEW_NOTE_MAX} znaków).`)
    }

    const supabase = createClient()
    const { data, error } = await supabase
        .from('legal_monitor_items')
        .update({
            status: input.status,
            reviewed_by: ctx.userId,
            reviewed_at: new Date().toISOString(),
            review_note: note.length > 0 ? note : null,
        })
        .eq('id', id)
        .select('id, title, severity, source, status')
        .maybeSingle()

    if (error) throw new Error(`Błąd zapisu przeglądu: ${error.message}`)
    // Brak wiersza = RLS odciął albo wpis zniknął. Nie udajemy sukcesu.
    if (!data) throw new Error('Nie znaleziono wpisu lub brak uprawnień do jego edycji.')

    const row = data as unknown as {
        title: string
        severity: string
        source: string
        status: string
    }
    await logAudit(ctx.userId, 'LEGAL_MONITOR_ITEM_REVIEWED', {
        item_id: id,
        status: input.status,
        severity: row.severity,
        source: row.source,
        title: row.title,
        has_note: note.length > 0,
    })

    revalidatePath(HUB_PATH)
}
