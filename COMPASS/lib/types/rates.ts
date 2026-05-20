// Phase 27c — User rates (history) + payroll types.

import type { BonusCategory } from './bonus'

export type RateCurrency = 'PLN' | 'EUR' | 'USD'

export interface UserRateRow {
    id: string
    user_id: string
    hourly_rate: number
    currency: RateCurrency
    effective_from: string // YYYY-MM-DD, always 1st of month
    effective_to: string | null
    set_by: string
    reason: string | null
    created_at: string
}

export interface UserRateWithUser extends UserRateRow {
    user_full_name: string | null
    user_email: string
    set_by_full_name: string | null
    set_by_email: string | null
}

/** Phase 27c — input for setUserRate. effective_from must be 1st of next/future month. */
export interface SetUserRateInput {
    user_id: string
    hourly_rate: number
    currency?: RateCurrency
    /** YYYY-MM-DD, must be 1st of month, must be >= next month first day. */
    effective_from: string
    reason?: string | null
}

/** Phase 27c — directory row in /internal/admin/rates. */
export interface UserRateDirectoryRow {
    user_id: string
    full_name: string | null
    email: string
    role: string
    manager_full_name: string | null
    employment_status: string | null
    current_rate: number | null
    current_currency: RateCurrency | null
    current_effective_from: string | null
}

// ─── Payroll summary ──────────────────────────────────────────────────────

/** Bonus line item in payroll summary. */
export interface PayrollBonusLine {
    id: string
    amount: number
    currency: string
    category: BonusCategory
    reason: string
    created_at: string
}

/** Phase 27c — payroll summary per user per month. */
export interface PayrollSummary {
    user_id: string
    full_name: string | null
    email: string
    role: string
    manager_id: string | null
    year: number
    month: number
    hours_total: number
    timesheet_status: 'approved' | 'submitted' | 'draft' | 'rejected' | 'missing'
    rate: number | null
    rate_currency: RateCurrency | null
    /** hours_total × rate (in rate_currency), or null when no rate set. */
    base_amount: number | null
    bonuses: PayrollBonusLine[]
    /** Sum of bonuses grouped by currency. */
    bonus_totals_by_currency: Record<string, number>
    /** Grand total in rate_currency, only meaningful when all bonus currencies match rate_currency. */
    grand_total: number | null
}

export const PAYROLL_MAX_RANGE_MONTHS = 24
