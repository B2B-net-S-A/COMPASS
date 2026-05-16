// Phase 23 — Premie (Bonuses)
//
// Manager-proposed bonuses for HR-zone employees. State machine:
//   pending → paid       (recipient links own invoice)
//   pending → cancelled  (proposer/admin)
//   paid    → pending    (unlink, if invoice rejected etc.)
//
// Compass nie liczy ani nie waliduje semantyki premii — manager wie kiedy i ile.
// Compass tylko trzyma dane + workflow + audit trail.

export type BonusStatus = 'pending' | 'paid' | 'cancelled'

export interface BonusRow {
    id: string
    recipient_user_id: string
    proposed_by: string
    amount: number
    currency: string
    reason: string
    status: BonusStatus
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
