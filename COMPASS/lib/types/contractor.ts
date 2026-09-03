// Phase 33 — Kontraktorzy: shared types, enums, PL labels, normalization maps.
// Pure module (no I/O) — safe to import from client + server + tests.

import { normalizePersonName } from '@/lib/types/placement'

// ─── Enums ──────────────────────────────────────────────────────────────────
export type ContractorStatus = 'prospect' | 'onboarding' | 'active' | 'offboarding' | 'exited'

export type ConversationCategory =
    | 'szkolenia'
    | 'podwyzka'
    | 'follow_up'
    | 'zejscie'
    | 'przedluzenie'
    | 'informacyjnie'
    | 'konferencja'
    | 'onboarding'
    | 'exit'
    | 'delegacja'
    | 'internalizacja'
    | 'zmiana_stawki'
    | 'inne'

export type ConversationStatus = 'w_toku' | 'rozwiazane' | 'potrzebny_kontakt' | 'pilne'

export type WhoResigned =
    | 'klient'
    | 'kandydat'
    | 'koniec_zamowienia'
    | 'internalizacja'
    | 'kandydat_klient'
    | 'nieznany'

export type InterviewStatus = 'scheduled' | 'submitted' | 'reviewed' | 'archived' | 'cancelled'

// ─── PL labels ────────────────────────────────────────────────────────────────
export const CONTRACTOR_STATUS_PL: Record<ContractorStatus, string> = {
    prospect: 'Prospekt',
    onboarding: 'Onboarding',
    active: 'Aktywny',
    offboarding: 'Offboarding',
    exited: 'Zakończony',
}

export const CONVERSATION_CATEGORY_PL: Record<ConversationCategory, string> = {
    szkolenia: 'Szkolenia',
    podwyzka: 'Podwyżka',
    follow_up: 'Follow-up',
    zejscie: 'Zejście',
    przedluzenie: 'Przedłużenie',
    informacyjnie: 'Informacyjnie',
    konferencja: 'Konferencja',
    onboarding: 'Onboarding',
    exit: 'Exit interview',
    delegacja: 'Delegacja',
    internalizacja: 'Internalizacja',
    zmiana_stawki: 'Zmiana stawki',
    inne: 'Inne',
}

export const CONVERSATION_STATUS_PL: Record<ConversationStatus, string> = {
    w_toku: 'W toku',
    rozwiazane: 'Rozwiązane',
    potrzebny_kontakt: 'Potrzebny kontakt',
    pilne: 'Pilne',
}

/** Tailwind badge classes per status — mirrors the Excel colour legend. */
export const CONVERSATION_STATUS_BADGE: Record<ConversationStatus, string> = {
    w_toku: 'bg-amber-100 text-amber-800 border-amber-200',
    rozwiazane: 'bg-green-100 text-green-800 border-green-200',
    potrzebny_kontakt: 'bg-blue-100 text-blue-800 border-blue-200',
    pilne: 'bg-red-100 text-red-800 border-red-200',
}

export const WHO_RESIGNED_PL: Record<WhoResigned, string> = {
    klient: 'Klient',
    kandydat: 'Kandydat',
    koniec_zamowienia: 'Koniec zamówienia',
    internalizacja: 'Internalizacja',
    kandydat_klient: 'Kandydat/Klient',
    nieznany: 'Nieznany',
}

export const INTERVIEW_STATUS_PL: Record<InterviewStatus, string> = {
    scheduled: 'Zaplanowany',
    submitted: 'Wypełniony',
    reviewed: 'Sprawdzony',
    archived: 'Zarchiwizowany',
    cancelled: 'Anulowany',
}

export const CONVERSATION_CATEGORIES: ConversationCategory[] = Object.keys(
    CONVERSATION_CATEGORY_PL,
) as ConversationCategory[]
export const CONVERSATION_STATUSES: ConversationStatus[] = Object.keys(
    CONVERSATION_STATUS_PL,
) as ConversationStatus[]

// ─── Normalization (messy Excel → clean enums) ──────────────────────────────
/** Map a free-text "Sprawa" value to a clean category (contains-based, diacritic-tolerant). */
export function normalizeConversationCategory(raw: string | null | undefined): ConversationCategory {
    const s = (raw ?? '').trim().toLowerCase()
    if (!s) return 'inne'
    if (s.includes('exit')) return 'exit'
    if (s.includes('onboarding')) return 'onboarding'
    if (s.includes('podwyż') || s.includes('podwyz')) return 'podwyzka'
    if (s.includes('obniż') || s.includes('obniz') || s.includes('stawk')) return 'zmiana_stawki'
    if (s.includes('follow')) return 'follow_up'
    if (s.includes('zej') || s.includes('wypowiedz')) return 'zejscie'
    if (s.includes('przedłuż') || s.includes('przedluz')) return 'przedluzenie'
    if (s.includes('szkol')) return 'szkolenia'
    if (s.includes('konferenc')) return 'konferencja'
    if (s.includes('delegac')) return 'delegacja'
    if (s.includes('internaliz')) return 'internalizacja'
    if (s.startsWith('inf') || s.includes('informac')) return 'informacyjnie'
    return 'inne'
}

/** Map a free-text "Kto zrezygnował" value to a clean enum. */
export function normalizeWhoResigned(raw: string | null | undefined): WhoResigned {
    const s = (raw ?? '').trim().toLowerCase()
    if (!s || s === '?') return 'nieznany'
    const hasKandydat = s.includes('kandydat')
    const hasKlient = s.includes('klient')
    if (hasKandydat && hasKlient) return 'kandydat_klient'
    if (s.includes('koniec') || s.includes('zamów') || s.includes('zamow')) return 'koniec_zamowienia'
    if (s.includes('internaliz')) return 'internalizacja'
    if (hasKandydat) return 'kandydat'
    if (hasKlient) return 'klient'
    return 'nieznany'
}

/**
 * Map an Excel cell fill colour (ARGB hex, e.g. "FFFFFF00") to a conversation status,
 * per the file's legend (w toku=yellow, rozwiązane=green, potrzebny kontakt=blue, pilne=red).
 * Returns null when no/neutral fill so the importer can apply its historical default.
 */
export function conversationStatusFromFill(argb: string | null | undefined): ConversationStatus | null {
    if (!argb) return null
    const hex = argb.toUpperCase().replace(/^FF/, '') // strip alpha
    if (hex.length < 6) return null
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if ([r, g, b].some((n) => Number.isNaN(n))) return null
    // near-white / no fill → no signal
    if (r > 240 && g > 240 && b > 240) return null
    const max = Math.max(r, g, b)
    if (max < 40) return null // near-black text, not a status fill
    if (r > 180 && g < 120 && b < 120) return 'pilne' // red
    if (g > 150 && r < 200 && b < 150) return 'rozwiazane' // green
    if (b > 150 && r < 150) return 'potrzebny_kontakt' // blue
    if (r > 180 && g > 150 && b < 120) return 'w_toku' // yellow/amber
    return null
}

/** Stable short key for idempotent import dedup (FNV-1a → base36). */
export function importExternalKey(...parts: Array<string | null | undefined>): string {
    const input = parts.map((p) => (p ?? '').trim().toLowerCase()).join('|')
    let h = 0x811c9dc5
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(36)
}

/** Normalize a contractor full name for natural-key matching (reuses placement logic). */
export const normalizeContractorName = normalizePersonName

// ─── DB row types (snake_case; subset used by UI/actions) ────────────────────
export interface ContractorRow {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    current_client: string | null
    current_position: string | null
    owner_tcm_id: string | null
    status: ContractorStatus
    profile_id: string | null
    notes: string | null
    created_at: string
    updated_at: string
}

export interface ContractorConversationRow {
    id: string
    contractor_id: string
    placement_id: string | null
    conversation_date: string
    tcm_id: string | null
    tcm_raw: string | null
    client_snapshot: string | null
    category: ConversationCategory
    status: ConversationStatus
    note: string | null
    follow_up_date: string | null
    resolved_at: string | null
    source: 'manual' | 'import'
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface ContractorOnboardingInterviewRow {
    id: string
    contractor_id: string
    placement_id: string | null
    position_snapshot: string | null
    client_snapshot: string | null
    start_date: string | null
    tcm_role_note: string | null
    first_day_note: string | null
    client_manager_name: string | null
    equipment_note: string | null
    system_access_note: string | null
    duties_note: string | null
    work_note: string | null
    manager_relation_note: string | null
    missing_resolved_note: string | null
    positive_surprise: string | null
    negative_surprise: string | null
    doubts_note: string | null
    side_projects_interest: boolean | null
    cs_challenge: string | null
    cs_solution: string | null
    cs_technologies: string | null
    cs_client: string | null
    cs_sector: string | null
    attachments: InterviewAttachment[]
    status: InterviewStatus
    scheduled_for: string | null
    submitted_at: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    reviewer_note: string | null
    created_at: string
    updated_at: string
}

export interface ContractorExitInterviewRow {
    id: string
    contractor_id: string
    placement_id: string | null
    position_snapshot: string | null
    client_snapshot: string | null
    start_date: string | null
    end_date: string | null
    formal_reason: string | null
    causes: string | null
    repair_potential: string | null
    is_final: boolean | null
    can_retain_transfer: boolean | null
    retain_transfer_note: string | null
    can_extend_departure: boolean | null
    extend_departure_note: string | null
    feedback_lessons: string | null
    attachments: InterviewAttachment[]
    status: InterviewStatus
    scheduled_for: string | null
    submitted_at: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    reviewer_note: string | null
    created_at: string
    updated_at: string
}

export interface InterviewAttachment {
    path: string
    name: string
    size: number
    hash?: string
    uploaded_at: string
}

export interface ClientEntryRow {
    id: string
    contractor_id: string | null
    consultant_name: string
    client_name: string
    position: string | null
    recruiter_raw: string | null
    recruiter_id: string | null
    delivery_lead_raw: string | null
    delivery_lead_id: string | null
    signing_date: string | null
    start_date: string | null
    order_term: string | null
    order_number: string | null
    guarantee: string | null
    cost_rate: number | null
    revenue_rate: number | null
    monthly_margin: number | null
    note_am: string | null
    note_billing: string | null
    note_hr: string | null
    source: 'manual' | 'import'
    created_at: string
    updated_at: string
}

export interface ClientDepartureRow {
    id: string
    contractor_id: string | null
    placement_id: string | null
    consultant_name: string
    client_name: string
    position: string | null
    recruiter_raw: string | null
    recruiter_id: string | null
    manager_raw: string | null
    start_date: string | null
    departure_date: string | null
    last_notice_day: string | null
    guarantee_ratio: number | null
    who_resigned: WhoResigned | null
    reason: string | null
    transferred: boolean
    replacement: boolean
    comment: string | null
    order_term: string | null
    order_number: string | null
    cost_rate: number | null
    revenue_rate: number | null
    monthly_margin: number | null
    note_am: string | null
    note_hr: string | null
    source: 'manual' | 'import'
    created_at: string
    updated_at: string
}

// ─── Action / display shapes (kept here so 'use server' modules export only fns) ──
export interface ContractorListItem extends ContractorRow {
    owner_tcm_name: string | null
}

export interface ContractorFilters {
    search?: string
    client?: string
    ownerTcmId?: string
    status?: ContractorStatus
}

export interface ConversationListItem extends ContractorConversationRow {
    contractor_name: string
    contractor_phone: string | null
    tcm_name: string | null
}

export interface ConversationFilters {
    contractorId?: string
    search?: string
    client?: string
    tcmId?: string
    category?: ConversationCategory
    status?: ConversationStatus
    limit?: number
}

export interface ContractorDetail {
    contractor: ContractorRow
    ownerTcmName: string | null
    conversations: ConversationListItem[]
    onboardingInterviews: ContractorOnboardingInterviewRow[]
    exitInterviews: ContractorExitInterviewRow[]
    entries: ClientEntryRow[]
    departures: ClientDepartureRow[]
    placements: Array<{ id: string; client_name: string; position: string | null; start_date: string; status: string }>
}

export interface ContractorDashboard {
    contractorsTotal: number
    contractorsActive: number
    openConversations: number
    entriesTotal: number
    departuresTotal: number
    departureReasons: Array<{ who: WhoResigned; count: number }>
    conversationsByTcm: Array<{ tcm: string; count: number }>
    departuresByClient: Array<{ client: string; count: number }>
}

// Typ wyniku analityki zejść (`DepartureAnalytics`) mieszka w lib/contractors/departure-analytics.ts
// — razem ze swoimi składowymi (MonthlyDepartureBucket, DepartureCount, DeparturePeriod).
// Trzymanie go tutaj wymagałoby cyklu importów: tamten moduł importuje stąd `WhoResigned`.

// ─── Phase 34: Zadania (department task list) ────────────────────────────────
export type ContractorTaskStatus = 'todo' | 'in_progress' | 'done'

export const CONTRACTOR_TASK_STATUS_PL: Record<ContractorTaskStatus, string> = {
    todo: 'Do zrobienia',
    in_progress: 'W toku',
    done: 'Zrobione',
}

export const CONTRACTOR_TASK_STATUS_BADGE: Record<ContractorTaskStatus, string> = {
    todo: 'bg-slate-100 text-slate-800 border-slate-200',
    in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
    done: 'bg-green-100 text-green-800 border-green-200',
}

export const CONTRACTOR_TASK_STATUSES: ContractorTaskStatus[] = Object.keys(
    CONTRACTOR_TASK_STATUS_PL,
) as ContractorTaskStatus[]

export interface ContractorTaskRow {
    id: string
    contractor_id: string | null
    source_ticket_id: string | null
    title: string
    description: string | null
    status: ContractorTaskStatus
    assigned_tcm_id: string | null
    due_date: string | null
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface ContractorTaskListItem extends ContractorTaskRow {
    contractor_name: string | null
    assigned_tcm_name: string | null
    source_ticket_subject: string | null
}


/**
 * "Open" conversation for the daily worklist: urgent / needs-contact, or a follow-up
 * that is due (on or before `today`) and not yet resolved. Pure — derives from loaded
 * data. Shared by the hub tab count and the "Sprawy otwarte" panel list so they agree.
 */
export function isOpenConversation(c: ConversationListItem, today: string): boolean {
    if (c.status === 'pilne' || c.status === 'potrzebny_kontakt') return true
    return c.follow_up_date != null && c.follow_up_date <= today && c.status !== 'rozwiazane'
}


// ─── Phase 38: 5-element Talent Community hub (Rozmowy / Onboarding / Exit / Kontraktorzy) ──
/**
 * One "Wejście" (placement or 2024 archive) augmented with its contractor link and the latest
 * onboarding-interview attachments. Drives both the read-only "Wejścia" feed and the actionable
 * "Onboarding" table (where the onboarding-interview file is uploaded per row).
 */
export interface OnboardingEntryItem {
    entry_id: string
    source: 'placement' | 'archive'
    consultant_name: string
    client_name: string
    position: string | null
    recruiter: string | null
    start_date: string | null
    /** Linked contractor, or null when the entry hasn't been matched to one yet. */
    contractor_id: string | null
    /** Latest onboarding interview for the contractor (null = none yet). */
    interview_id: string | null
    interview_status: InterviewStatus | null
    attachments: InterviewAttachment[]
}

/**
 * A recorded departure augmented with the latest exit-interview attachments. Drives both the full
 * "Zejścia" table and the "Exit Interview" table (where the exit-interview file is uploaded).
 */
export interface ExitDepartureItem extends ClientDepartureRow {
    interview_id: string | null
    interview_status: InterviewStatus | null
    attachments: InterviewAttachment[]
}

/**
 * Current contractor roster with commercials — sourced from live placements (Phase 28) plus the
 * 2024 archive, deduped by natural key. Surfaces the rate columns the contractor roster needs.
 */
export interface ContractorRosterItem {
    id: string
    source: 'placement' | 'archive'
    consultant_name: string
    client_name: string
    recruiter: string | null
    delivery_lead: string | null
    start_date: string | null
    revenue_rate: number | null
    cost_rate: number | null
    monthly_margin: number | null
    contractor_id: string | null
}

/** File kinds that accept an interview attachment upload. */
export type InterviewKind = 'onboarding' | 'exit'

// ─── Phase 39: Bench (consultants between projects) ──────────────────────────
export type BenchStatus = 'w_rekrutacji' | 'przepiety' | 'zakonczenie_umowy'
export type BenchBenefits = 'aktywne' | 'nieaktywne' | 'do_wygaszenia'

export const BENCH_STATUS_PL: Record<BenchStatus, string> = {
    w_rekrutacji: 'W rekrutacji',
    przepiety: 'Przepięty',
    zakonczenie_umowy: 'Zakończenie umowy',
}

export const BENCH_BENEFITS_PL: Record<BenchBenefits, string> = {
    aktywne: 'Aktywne',
    nieaktywne: 'Nieaktywne',
    do_wygaszenia: 'Do wygaszenia',
}

export const BENCH_STATUSES: BenchStatus[] = Object.keys(BENCH_STATUS_PL) as BenchStatus[]
export const BENCH_BENEFITS: BenchBenefits[] = Object.keys(BENCH_BENEFITS_PL) as BenchBenefits[]

/** A bench worklist entry — a consultant who left (or is leaving soon) and needs a new project. */
export interface BenchItem {
    id: string
    contractor_id: string | null
    departure_id: string | null
    consultant_name: string
    client_name: string | null
    role: string | null
    departure_date: string | null
    notice_date: string | null
    status: BenchStatus
    benefits: BenchBenefits
    source: 'auto' | 'manual'
    dismissed_at: string | null
}

// ─── Opieka TCM (lista konsultantów + opiekun) ───────────────────────────────
/**
 * Dlaczego osoba jest na liście opieki. Rozstrzygane z danych, nie z
 * `contractors.status` — ten ostatni ma na produkcji wartość 'active' u
 * WSZYSTKICH 688 rekordów, bo taki był default importu, i nie mówi nic o tym,
 * czy ktoś dziś pracuje.
 */
export type CareSituation = 'u_klienta' | 'bench'

/** Jeden konsultant na liście opieki Talent Community. */
export interface CareRosterItem {
    contractorId: string
    fullName: string
    situation: CareSituation
    clientName: string | null
    position: string | null
    /** Wejście do klienta (`u_klienta`) albo zejście z projektu (`bench`). */
    sinceDate: string | null
    /** Etap benchu — tylko dla `situation === 'bench'`. */
    benchStatus: BenchStatus | null
    ownerTcmId: string | null
    ownerTcmName: string | null
}
