// Phase 23 — Premie (Bonuses)
// Phase 26 — uproszczony workflow: manager przypisuje (status='assigned', auto-approved, terminal).
// Phase 27b — 4 kategorie premii (sales/delivery_lead/recruiter/custom) z typed columns
//             per category + opcjonalny attachment (PDF/img max 10MB) dla każdej kategorii.
//
// State machine:
//   assigned → cancelled (proposer/admin)
//
// Legacy (Phase 23) ścieżki dla wstecznej kompatybilności:
//   pending → paid       (recipient links own invoice)
//   pending → cancelled  (proposer/admin)
//   paid    → pending    (unlink)

export type BonusStatus = 'assigned' | 'pending' | 'paid' | 'cancelled'

/** Phase 27b + 31 — bonus categories. Sales/Delivery Lead/Rekruter/Niestandardowa/Champions League. */
export type BonusCategory = 'sales' | 'delivery_lead' | 'recruiter' | 'custom' | 'champions_league'

export interface BonusAttachment {
    attachment_path: string | null
    attachment_filename: string | null
    attachment_size_bytes: number | null
    attachment_mime: string | null
}

export interface BonusRow {
    id: string
    recipient_user_id: string
    proposed_by: string
    amount: number
    currency: string
    reason: string
    status: BonusStatus
    period_year: number | null
    period_month: number | null
    linked_invoice_id: string | null
    paid_at: string | null
    cancelled_at: string | null
    cancelled_by: string | null
    cancellation_reason: string | null
    notes: string | null
    created_at: string
    updated_at: string
    // Phase 27b — category + per-category fields + attachment
    category: BonusCategory
    // Phase 27d — unified client_name (sales/delivery/recruiter) + delivery candidate (free text)
    client_name: string | null
    delivery_candidate_name: string | null
    sales_client_name: string | null // legacy (Phase 27b) — superseded by client_name
    sales_service_description: string | null
    delivery_consultant_id: string | null // legacy (Phase 27b) — superseded by delivery_candidate_name
    delivery_margin_amount: number | null
    delivery_margin_percent: number | null
    recruiter_margin_per_hour: number | null
    recruiter_candidate_name: string | null
    recruiter_calculated_tier: 1 | 2 | 3 | null
    custom_email_memo: string | null
    attachment_path: string | null
    attachment_filename: string | null
    attachment_size_bytes: number | null
    attachment_mime: string | null
    // Phase 31 — champions league
    place_rank: 1 | 2 | 3 | null
    period_quarter: 1 | 2 | 3 | 4 | null
}

export interface BonusWithUsers extends BonusRow {
    recipient_full_name: string | null
    recipient_email: string
    proposer_full_name: string | null
    proposer_email: string | null
    linked_invoice_number: string | null
}

/** Phase 27b/d — Sales category input shape. */
export interface AssignBonusInputSales {
    category: 'sales'
    recipient_user_id: string
    period_year: number
    period_month: number
    amount: number
    currency?: string
    reason: string
    notes?: string | null
    client_name: string
    sales_service_description: string
}

/** Phase 27b/d — Delivery Lead category input shape. Candidate = free text (Phase 27d). */
export interface AssignBonusInputDelivery {
    category: 'delivery_lead'
    recipient_user_id: string
    period_year: number
    period_month: number
    amount: number
    currency?: string
    reason: string
    notes?: string | null
    client_name: string
    delivery_candidate_name: string
    delivery_margin_amount: number
    delivery_margin_percent?: number
}

/** Phase 27b/d — Recruiter category input shape. */
export interface AssignBonusInputRecruiter {
    category: 'recruiter'
    recipient_user_id: string
    period_year: number
    period_month: number
    amount: number
    currency?: string
    reason: string
    notes?: string | null
    client_name: string
    recruiter_margin_per_hour: number
    recruiter_candidate_name: string
}

/** Phase 27b — Custom category input shape. Memo OR attachment required (server enforces). */
export interface AssignBonusInputCustom {
    category: 'custom'
    recipient_user_id: string
    period_year: number
    period_month: number
    amount: number
    currency?: string
    reason: string
    notes?: string | null
    custom_email_memo?: string | null
}

/**
 * Phase 31 — Champions League category input shape.
 * Quarterly bonus (period_quarter zamiast period_month), miejsce 1/2/3.
 * Default amounts (CHAMPIONS_LEAGUE_AMOUNTS): 1→5000, 2→3000, 3→2000 — override dozwolony.
 */
export interface AssignBonusInputChampionsLeague {
    category: 'champions_league'
    recipient_user_id: string
    period_year: number
    period_quarter: 1 | 2 | 3 | 4
    place_rank: 1 | 2 | 3
    amount: number
    currency?: string
    reason: string
    notes?: string | null
}

/** Phase 27b + 31 — discriminated union for assignBonus action. */
export type AssignBonusInput =
    | AssignBonusInputSales
    | AssignBonusInputDelivery
    | AssignBonusInputRecruiter
    | AssignBonusInputCustom
    | AssignBonusInputChampionsLeague

/**
 * Phase 26 — edit existing assigned bonus (amount/reason/notes; recipient+category immutable).
 * Phase 32 — finanse/admin może też skorygować miesiąc standardowej premii (period_year +
 * period_month, oba razem). Champions League ma okres kwartalny i edytuje się osobnym formularzem.
 */
export interface UpdateBonusInput {
    id: string
    amount?: number
    reason?: string
    notes?: string | null
    period_year?: number
    period_month?: number
}

/** Phase 26 — dropdown candidate for AssignBonusForm. */
export interface EligibleEmployeeForBonus {
    user_id: string
    full_name: string | null
    email: string
    role: string
}

/** @deprecated Phase 26 — use AssignBonusInput. Kept for backward compat (callers gated by INVOICES_ENABLED). */
export interface ProposeBonusInput {
    recipient_user_id: string
    amount: number
    currency?: string
    reason: string
    notes?: string | null
}

export interface CancelBonusInput {
    id: string
    cancellation_reason: string
}

/** @deprecated Phase 26 — invoice link path disabled. */
export interface LinkBonusInput {
    id: string
    invoice_id: string
}

export interface BonusListFilter {
    status?: BonusStatus
    recipient_user_id?: string
    period_year?: number
    period_month?: number
}

export const BONUS_MIN_AMOUNT = 1
export const BONUS_MAX_AMOUNT = 1_000_000
export const BONUS_REASON_MIN_LENGTH = 3
export const BONUS_REASON_MAX_LENGTH = 1000

/** Phase 26 — allowed period range: past 12 months + current. */
export const BONUS_PERIOD_MAX_MONTHS_BACK = 12

export const BONUS_MONTHS_PL = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
] as const

// ─── Phase 27b — Categories + recruiter tiers ─────────────────────────────

export const BONUS_CATEGORIES_PL: Record<BonusCategory, string> = {
    sales: 'Sales',
    delivery_lead: 'Delivery Lead',
    recruiter: 'Rekruter',
    custom: 'Niestandardowa',
    champions_league: 'Liga Mistrzów',
}

/** Phase 27b — recruiter bonus tiers (PLN/h margin → flat bonus in PLN). */
export interface RecruiterTier {
    tier: 1 | 2 | 3
    label: string
    min: number
    /** Exclusive upper bound; null = infinity. */
    max: number | null
    bonus: number
}

export const RECRUITER_TIERS: RecruiterTier[] = [
    { tier: 1, label: 'I (≤ 40 PLN/h)', min: 0, max: 40, bonus: 1000 },
    { tier: 2, label: 'II (40-50 PLN/h)', min: 40, max: 50, bonus: 1500 },
    { tier: 3, label: 'III (≥ 50 PLN/h)', min: 50, max: null, bonus: 2000 },
]

/** Phase 27b — pure compute helper mirroring SQL `recruiter_bonus_for_margin`. */
export function recruiterTierForMargin(margin: number): RecruiterTier | null {
    if (!Number.isFinite(margin) || margin < 0) return null
    if (margin <= 40) return RECRUITER_TIERS[0]
    if (margin < 50) return RECRUITER_TIERS[1]
    return RECRUITER_TIERS[2]
}

// ─── Phase 27b — Attachment constraints ───────────────────────────────────

export const BONUS_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
export const BONUS_ATTACHMENT_ALLOWED_MIME = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
] as const

export const BONUS_CUSTOM_MEMO_MAX_LENGTH = 5000

// ─── Phase 31 — Champions League (premia kwartalna, manualna) ─────────────

export type ChampionsLeagueRank = 1 | 2 | 3
export type Quarter = 1 | 2 | 3 | 4

/** Phase 31 — domyślne kwoty per miejsce w PLN. Override dozwolony w form. */
export const CHAMPIONS_LEAGUE_AMOUNTS: Record<ChampionsLeagueRank, number> = {
    1: 5000,
    2: 3000,
    3: 2000,
} as const

export function championsLeagueAmountForPlace(rank: ChampionsLeagueRank): number {
    return CHAMPIONS_LEAGUE_AMOUNTS[rank]
}

/** Phase 31 — labels z emoji medali dla UI. */
export const CHAMPIONS_LEAGUE_PLACE_LABELS_PL: Record<ChampionsLeagueRank, string> = {
    1: '🥇 1. miejsce',
    2: '🥈 2. miejsce',
    3: '🥉 3. miejsce',
} as const

export const CHAMPIONS_LEAGUE_PLACE_SHORT_PL: Record<ChampionsLeagueRank, string> = {
    1: '🥇 1.',
    2: '🥈 2.',
    3: '🥉 3.',
} as const

export const BONUS_QUARTERS_PL = ['Q1', 'Q2', 'Q3', 'Q4'] as const

/** Phase 31 — liczba kwartałów wstecz dozwolona przy assign. */
export const CHAMPIONS_LEAGUE_MAX_QUARTERS_BACK = 4

/**
 * Phase 31 — pure helper: sprawdza czy (year, quarter) mieści się w dozwolonym oknie
 * (current quarter + 4 wstecz). Walidacja klient + serwer.
 */
export function isQuarterInAllowedRange(year: number, quarter: Quarter, now: Date = new Date()): boolean {
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth() + 1 // 1-12
    const currentQuarter = Math.ceil(currentMonth / 3) as Quarter

    // Convert to absolute "quarter index" (year*4 + quarter)
    const targetIdx = year * 4 + quarter
    const currentIdx = currentYear * 4 + currentQuarter

    return targetIdx <= currentIdx && targetIdx >= currentIdx - CHAMPIONS_LEAGUE_MAX_QUARTERS_BACK
}
