// Phase 23 — Premie (Bonuses)
// Phase 26 — uproszczony workflow: manager przypisuje (status='assigned', auto-approved, terminal).
//
// State machine:
//   assigned → cancelled (proposer/admin)
//
// Legacy (Phase 23) ścieżki dla wstecznej kompatybilności:
//   pending → paid       (recipient links own invoice)
//   pending → cancelled  (proposer/admin)
//   paid    → pending    (unlink)
//
// Compass nie liczy ani nie waliduje semantyki premii — manager wie kiedy i ile.
// Compass trzyma dane + workflow + audit trail + notyfikacje.

export type BonusStatus = 'assigned' | 'pending' | 'paid' | 'cancelled'

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
}

export interface BonusWithUsers extends BonusRow {
    recipient_full_name: string | null
    recipient_email: string
    proposer_full_name: string | null
    proposer_email: string | null
    linked_invoice_number: string | null
}

/** Phase 26 — primary assignment input. Manager przypisuje od razu jako 'assigned'. */
export interface AssignBonusInput {
    recipient_user_id: string
    period_year: number
    period_month: number
    amount: number
    currency?: string
    reason: string
    notes?: string | null
}

/** Phase 26 — edit existing assigned bonus (amount/reason/notes only; period+recipient immutable). */
export interface UpdateBonusInput {
    id: string
    amount?: number
    reason?: string
    notes?: string | null
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
