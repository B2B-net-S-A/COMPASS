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
import {
    requireFinanseOrAdminAction,
    requireLegalMonitorViewerAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sortItemsForReview } from '@/lib/legal-monitor/health'
import type { PublicHolidayDate } from '@/lib/hr/working-days'
import {
    isReviewStatus,
    LEGAL_SEVERITY_META,
    LEGAL_SOURCE_LABELS_PL,
    LEGAL_STATUS_META,
    LEGAL_TOPIC_LABELS_PL,
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

/** Sufit operacji zbiorczej — chroni przed przypadkowym „zaznacz wszystko" na tysiącu wpisów. */
const BULK_LIMIT = 200

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
    await requireLegalMonitorViewerAction()
    const supabase = createClient()

    const { data, error } = await supabase
        .from('legal_monitor_items')
        .select(
            'id, source, source_label, topic, severity, published_at, reference, title, url, summary, why_it_matters, status, reviewed_by, reviewed_at, review_note, created_at, due_date, assigned_to, alerted_at, pinned_at, pinned_by',
        )
        // To sortowanie NIE jest zbędne mimo późniejszego sortItemsForReview: decyduje,
        // KTÓRE wiersze przetrwają limit poniżej. Bez niego Postgres mógłby oddać
        // dowolne 1000 wierszy i najświeższe wpisy zniknęłyby ze skrzynki.
        .order('created_at', { ascending: false })
        .limit(ITEMS_LIMIT)
    if (error) throw new Error(`Błąd pobierania monitoringu prawnego: ${error.message}`)

    // Nazwy dokładamy niżej ze split-query, więc wiersz z bazy ich jeszcze nie ma.
    const rows = (data ?? []) as unknown as Array<
        Omit<LegalMonitorItemRow, 'reviewed_by_name' | 'assigned_to_name' | 'pinned_by_name'>
    >
    if (rows.length === 0) return []

    // Jedno zapytanie na wszystkie trzy pola — przeglądający, osoba odpowiedzialna
    // i przypinający to zwykle te same osoby, więc nie ma sensu odpytywać profiles
    // trzy razy.
    const reviewerIds = Array.from(
        new Set(
            rows
                .flatMap((r) => [r.reviewed_by, r.assigned_to, r.pinned_by])
                .filter((id): id is string => Boolean(id)),
        ),
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
            assigned_to_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
            pinned_by_name: r.pinned_by ? (names.get(r.pinned_by) ?? null) : null,
        })),
    )
}

/** Log przebiegów (heartbeat) — najświeższy pierwszy. Zasila banner i „Historię sprawdzeń". */
export async function listLegalMonitorRuns(limit: number = RUNS_LIMIT): Promise<LegalMonitorRunRow[]> {
    await requireLegalMonitorViewerAction()
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
    await requireLegalMonitorViewerAction()
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
    await requireLegalMonitorViewerAction()
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
            // Phase 52: odrzucenie zdejmuje pinezkę — „nieistotne" i „trzymamy
            // na górze" nie mogą być prawdziwe naraz. Pozostałe statusy jej NIE
            // ruszają: przypięty wpis ma przetrwać przegląd.
            ...(input.status === 'dismissed' ? { pinned_at: null, pinned_by: null } : {}),
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

/**
 * Phase 50 — oznaczanie hurtem. Pierwsza sesja triage'u to kilkanaście pozycji
 * (start modułu to backfill 13 miesięcy historii), a klikanie ich po jednej
 * sprawia, że nikt tego nie zrobi. Zwraca liczbę faktycznie zmienionych wierszy.
 */
export async function reviewLegalMonitorItems(
    ids: string[],
    status: LegalMonitorReviewStatus,
    note?: string | null,
): Promise<number> {
    const ctx = await requireFinanseOrAdminAction()

    const clean = Array.from(new Set((ids ?? []).map((i) => (i ?? '').trim()).filter(Boolean)))
    if (clean.length === 0) throw new Error('Nie wybrano żadnego wpisu.')
    if (clean.length > BULK_LIMIT) {
        throw new Error(`Maksymalnie ${BULK_LIMIT} wpisów naraz.`)
    }
    if (!isReviewStatus(status)) throw new Error('Nieprawidłowy status przeglądu.')

    const trimmed = (note ?? '').trim()
    if (trimmed.length > REVIEW_NOTE_MAX) {
        throw new Error(`Notatka jest za długa (max ${REVIEW_NOTE_MAX} znaków).`)
    }

    const supabase = createClient()
    const payload: Record<string, unknown> = {
        status,
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
    }
    // Pusta notatka przy operacji zbiorczej NIE kasuje notatek indywidualnych —
    // inaczej hurtowe „Przejrzane" wymazałoby ustalenia wpisane wcześniej ręcznie.
    if (trimmed.length > 0) payload.review_note = trimmed
    // Ta sama reguła co przy pojedynczym przeglądzie: odrzucenie zdejmuje pinezkę.
    if (status === 'dismissed') {
        payload.pinned_at = null
        payload.pinned_by = null
    }

    const { data, error } = await supabase
        .from('legal_monitor_items')
        .update(payload)
        .in('id', clean)
        .select('id')
    if (error) throw new Error(`Błąd zapisu przeglądu: ${error.message}`)

    const changed = (data ?? []).length
    if (changed === 0) throw new Error('Nie zmieniono żadnego wpisu — sprawdź uprawnienia.')

    await logAudit(ctx.userId, 'LEGAL_MONITOR_ITEMS_BULK_REVIEWED', {
        status,
        requested: clean.length,
        changed,
        has_note: trimmed.length > 0,
    })
    revalidatePath(HUB_PATH)
    return changed
}

/**
 * Phase 52 — przypięcie wpisu na górę skrzynki (albo zdjęcie pinezki).
 *
 * Pinezka jest WSPÓLNA (jak status, notatka i termin) i ORTOGONALNA do statusu:
 * przypiąć można wpis w dowolnym stanie, a przegląd jej nie zdejmuje. Jedyny
 * wyjątek to odrzucenie — patrz `reviewLegalMonitorItem`.
 *
 * Bierze docelowy stan, nie „przełącz", żeby dwa kliknięcia z dwóch kart nie
 * dawały wyniku zależnego od kolejności. Ponowne przypięcie już przypiętego
 * odświeża stempel i autora (przeskakuje na górę sekcji) — z UI nieosiągalne,
 * bo sekcja dni zawiera wyłącznie nieprzypięte, ale warto o tym wiedzieć,
 * dodając kolejnego wywołującego.
 */
export async function setLegalMonitorPin(input: { id: string; pinned: boolean }): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()
    const id = (input.id ?? '').trim()
    if (!id) throw new Error('Brak identyfikatora wpisu.')

    const supabase = createClient()
    const { data, error } = await supabase
        .from('legal_monitor_items')
        .update(
            input.pinned
                ? { pinned_at: new Date().toISOString(), pinned_by: ctx.userId }
                : { pinned_at: null, pinned_by: null },
        )
        .eq('id', id)
        .select('id, title, severity, source, status')
        .maybeSingle()

    if (error) throw new Error(`Błąd zapisu pinezki: ${error.message}`)
    if (!data) throw new Error('Nie znaleziono wpisu lub brak uprawnień do jego edycji.')

    const row = data as unknown as { title: string; severity: string; source: string }
    await logAudit(ctx.userId, input.pinned ? 'LEGAL_MONITOR_ITEM_PINNED' : 'LEGAL_MONITOR_ITEM_UNPINNED', {
        item_id: id,
        title: row.title,
        severity: row.severity,
        source: row.source,
    })
    revalidatePath(HUB_PATH)
}

/**
 * Phase 50 — termin i osoba odpowiedzialna dla wpisu „do reakcji".
 *
 * Świadomie NIE podpinamy się pod `contractor_tasks` ani `tasks`: pierwsze ma RLS
 * `has_lifecycle_access()` (admin+TCM — finanse by tam nie sięgnął), drugie to
 * osobiste tablice kanban przypisane do właściciela. Termin trzymany na samym
 * wpisie daje follow-through bez przeciągania uprawnień przez pół aplikacji,
 * a cron dobowy przypomina o zaległościach.
 */
export async function setLegalMonitorFollowUp(input: {
    id: string
    dueDate: string | null
    assignedTo: string | null
}): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()
    const id = (input.id ?? '').trim()
    if (!id) throw new Error('Brak identyfikatora wpisu.')

    const dueDate = (input.dueDate ?? '').trim() || null
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        throw new Error('Nieprawidłowy format terminu.')
    }
    const assignedTo = (input.assignedTo ?? '').trim() || null

    const supabase = createClient()

    // Dropdown w UI jest już zawężony do finanse+admin, ale server action to
    // publiczne wejście — bez tego bezpośrednie wywołanie mogłoby przypisać
    // reakcję konsultantowi albo osobie zarchiwizowanej, a cron słałby jej
    // codzienne przypomnienia.
    if (assignedTo) {
        const { data: candidate } = await supabase
            .from('profiles')
            .select('id, role, employment_status')
            .eq('id', assignedTo)
            .maybeSingle()
        const row = candidate as { role?: string; employment_status?: string } | null
        const eligible =
            !!row && (row.role === 'admin' || row.role === 'finanse') && row.employment_status !== 'exited'
        if (!eligible) {
            throw new Error('Reakcję można przypisać tylko aktywnej osobie z rolą finanse lub admin.')
        }
    }
    const { data, error } = await supabase
        .from('legal_monitor_items')
        .update({
            due_date: dueDate,
            assigned_to: assignedTo,
            // Zmiana terminu kasuje stempel przypomnienia, żeby nowy termin
            // mógł się odezwać, nawet jeśli o starym już przypominaliśmy.
            reminded_at: null,
        })
        .eq('id', id)
        .select('id')
        .maybeSingle()
    if (error) throw new Error(`Błąd zapisu terminu: ${error.message}`)
    if (!data) throw new Error('Nie znaleziono wpisu lub brak uprawnień do jego edycji.')

    await logAudit(ctx.userId, 'LEGAL_MONITOR_FOLLOWUP_SET', {
        item_id: id,
        due_date: dueDate,
        assigned_to: assignedTo,
    })
    revalidatePath(HUB_PATH)
}

/** Osoby, którym można przypisać reakcję (finanse + admin, bez zarchiwizowanych). */
export async function listLegalMonitorAssignees(): Promise<
    Array<{ id: string; name: string }>
> {
    await requireFinanseOrAdminAction()
    const supabase = createClient()
    const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('role', ['admin', 'finanse'])
        .neq('employment_status', 'exited')
        .order('full_name')
    return ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => ({ id: p.id, name: p.full_name || p.email || '—' }),
    )
}

function csvCell(value: string | null | undefined): string {
    const v = (value ?? '').replace(/"/g, '""')
    return `"${v}"`
}

/**
 * Phase 50 — eksport CSV na spotkanie finansowo-prawne.
 * UTF-8 z BOM, żeby Excel nie rozsypał polskich znaków (jak w pozostałych eksportach).
 */
export async function exportLegalMonitorCsv(ids?: string[]): Promise<string> {
    const ctx = await requireLegalMonitorViewerAction()
    const items = await listLegalMonitorItems()
    const selected = ids && ids.length > 0 ? new Set(ids) : null
    const rows = selected ? items.filter((i) => selected.has(i.id)) : items

    const header = [
        'Pilność', 'Status', 'Temat', 'Źródło', 'Nazwa źródła', 'Sygnatura',
        'Data dokumentu', 'Tytuł', 'Podsumowanie', 'Co to znaczy dla firmy',
        'Link', 'Termin reakcji', 'Odpowiedzialny', 'Przejrzał', 'Notatka',
    ]
    const lines = [header.map(csvCell).join(',')]
    for (const i of rows) {
        lines.push(
            [
                LEGAL_SEVERITY_META[i.severity].label,
                LEGAL_STATUS_META[i.status].label,
                LEGAL_TOPIC_LABELS_PL[i.topic],
                LEGAL_SOURCE_LABELS_PL[i.source],
                i.source_label,
                i.reference,
                i.published_at,
                i.title,
                i.summary,
                i.why_it_matters,
                i.url,
                i.due_date,
                i.assigned_to_name,
                i.reviewed_by_name,
                i.review_note,
            ].map(csvCell).join(','),
        )
    }

    await logAudit(ctx.userId, 'LEGAL_MONITOR_EXPORTED_CSV', { rows: rows.length })
    return `﻿${lines.join('\n')}`
}
