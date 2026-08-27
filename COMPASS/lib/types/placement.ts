// Phase 28 — Placementy: shared types + constants for Excel import, bonus compute, eligibility.

export const PLACEMENT_HOURS_THRESHOLD = 168
/** 168h / 8h-per-day = 21 working days (weekends skipped) → projected 168h-completion date. */
export const PLACEMENT_ELIGIBLE_BUSINESS_DAYS = 21
/** DL bonus = monthly margin × 10%. */
export const DL_BONUS_PERCENT = 10
/** Monthly margin standardised to 168h (matches Excel "Marża miesięcznie"). */
export const PLACEMENT_MONTHLY_HOURS = 168

export type PlacementStatus = 'upcoming' | 'started' | 'bonus_confirmed' | 'cancelled'

export type PlacementDiffStatus = 'new' | 'updated' | 'unchanged'

/** Canonical PL headers expected in the upload (case-insensitive, trimmed). */
export const PLACEMENT_COLUMNS = {
    consultant: 'Konsultant',
    client: 'Klient',
    deliveryLead: 'DL',
    position: 'Stanowisko',
    costRate: 'Stawka kosztowa',
    revenueRate: 'Stawka przychodowa',
    margin: 'Marża',
    monthlyMargin: 'Marża miesięcznie',
    signingDate: 'Data podpisania',
    startDate: 'Start day',
    recruiter: 'Rekruter',
} as const

/** One raw row parsed from Excel, before person-resolution and bonus compute. */
export interface ParsedPlacementRow {
    /** 1-based source row number (Excel), for error messages. */
    rowNumber: number
    consultantName: string
    clientName: string
    position: string | null
    deliveryLeadRaw: string
    recruiterRaw: string
    costRate: number
    revenueRate: number
    /** ISO yyyy-mm-dd, or null if absent. */
    signingDate: string | null
    /** ISO yyyy-mm-dd (required). */
    startDate: string
    /** Optional control values from the file — warn (not fail) on mismatch with computed. */
    marginFromFile: number | null
    monthlyMarginFromFile: number | null
}

/** Bonus + eligibility fields computed from a parsed row. */
export interface PlacementBonusFields {
    marginPerHour: number
    monthlyMargin: number
    dlBonusAmount: number
    recruiterTier: 1 | 2 | 3
    recruiterBonusAmount: number
    /** ISO yyyy-mm-dd: start_date + 21 business days. */
    bonusEligibleDate: string
}

/** A distinct DL/recruiter name from the upload that must be mapped to a profile. */
export interface PersonResolution {
    rawName: string
    rawNameNorm: string
    /** Best fuzzy suggestion (alias hit or top name match). */
    suggestedProfileId: string | null
    suggestions: ReadonlyArray<{ id: string; fullName: string; role: string }>
}

/** A parsed+computed row in the review screen, with diff vs. existing placements. */
export interface PlacementReviewRow extends ParsedPlacementRow, PlacementBonusFields {
    naturalKey: string
    diff: PlacementDiffStatus
}

/** Result of diffing an uploaded file against existing placements. */
export interface PlacementImportPreview {
    rows: PlacementReviewRow[]
    /** Distinct DL/recruiter names needing resolution (mapped once, applied to all rows). */
    people: PersonResolution[]
    /** All assignable profiles (for the mapping dropdown when a suggestion is wrong). */
    candidates: ReadonlyArray<{ id: string; fullName: string; role: string }>
    /** Existing placements whose natural key is absent from the uploaded file. */
    disappeared: Array<{ id: string; consultantName: string; clientName: string; startDate: string }>
    warnings: string[]
    /** Total rows scanned below the header (= accepted + rejected). Lets the UI surface
     *  silent parser drops by comparing against `rows.length`. */
    scannedRows: number
    /** Rows skipped silently because every column was blank (separator rows). */
    skippedBlankRows: number
}

/** Result summary returned by a commit import. */
export interface CommitImportResult {
    created: number
    updated: number
    ticketsCreated: number
    cancelled: number
}

/** DB row (snake_case, subset used by UI/actions). */
export interface PlacementRow {
    id: string
    consultant_name: string
    client_name: string
    position: string | null
    start_date: string
    signing_date: string | null
    delivery_lead_id: string
    recruiter_id: string
    delivery_lead_raw: string
    recruiter_raw: string
    cost_rate: number
    revenue_rate: number
    margin_per_hour: number
    monthly_margin: number
    bonus_eligible_date: string
    dl_bonus_amount: number
    recruiter_tier: number
    recruiter_bonus_amount: number
    status: PlacementStatus
    hours_confirmed_at: string | null
    hours_confirmed_by: string | null
    cancelled_at: string | null
    cancel_reason: string | null
    dl_bonus_id: string | null
    recruiter_bonus_id: string | null
    tcm_ticket_id: string | null
    created_at: string
    updated_at: string
}

/**
 * Phase 28 follow-up — placement row augmented with the current status of its linked
 * DL/recruiter bonuses, so the admin/manager UI can hide the cancel button after a
 * bonus has already been cancelled (or never linked, e.g. legacy rows).
 */
export interface PlacementWithBonusStatus extends PlacementRow {
    dl_bonus_status: 'assigned' | 'pending' | 'paid' | 'cancelled' | null
    recruiter_bonus_status: 'assigned' | 'pending' | 'paid' | 'cancelled' | null
    dl_bonus_actual_amount: number | null
    recruiter_bonus_actual_amount: number | null
}

export interface PlacementRecipientBonusSummary {
    isDeliveryLead: boolean
    isRecruiter: boolean
    amount: number
    /** True when 168h was confirmed but this recipient has no currently linked active bonus. */
    hasNoActiveBonus: boolean
}

/**
 * Resolve the amount visible to one placement participant. Before 168h confirmation this
 * is the forecast. Afterwards only actually linked bonuses count, so an intentional opt-out
 * never looks like money that was awarded.
 */
export function placementRecipientBonusSummary(
    placement: PlacementWithBonusStatus,
    userId: string,
): PlacementRecipientBonusSummary {
    const isDeliveryLead = placement.delivery_lead_id === userId
    const isRecruiter = placement.recruiter_id === userId
    const confirmed = placement.status === 'bonus_confirmed'
    // listPlacements/listMyPlacements enrich every non-null bonus link with its status and
    // actual amount. Treating only an absent link or an explicit cancellation as inactive
    // keeps intentional opt-outs distinct from the pre-confirmation forecast.
    const dlActive =
        isDeliveryLead &&
        (!confirmed || (placement.dl_bonus_id !== null && placement.dl_bonus_status !== 'cancelled'))
    const recruiterActive =
        isRecruiter &&
        (!confirmed ||
            (placement.recruiter_bonus_id !== null && placement.recruiter_bonus_status !== 'cancelled'))
    const dlAmount = confirmed
        ? placement.dl_bonus_actual_amount ?? Number(placement.dl_bonus_amount)
        : Number(placement.dl_bonus_amount)
    const recruiterAmount = confirmed
        ? placement.recruiter_bonus_actual_amount ?? Number(placement.recruiter_bonus_amount)
        : Number(placement.recruiter_bonus_amount)

    return {
        isDeliveryLead,
        isRecruiter,
        amount: (dlActive ? dlAmount : 0) + (recruiterActive ? recruiterAmount : 0),
        hasNoActiveBonus:
            confirmed && (isDeliveryLead || isRecruiter) && !dlActive && !recruiterActive,
    }
}

/** Case-insensitive natural key for idempotent re-upload (consultant + client + start). */
export function placementNaturalKey(consultantName: string, clientName: string, startDateISO: string): string {
    return `${consultantName.trim().toLowerCase()}|${clientName.trim().toLowerCase()}|${startDateISO}`
}

/** Normalise a person name for alias matching. */
export function normalizePersonName(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function placementStatusLabelPl(status: PlacementStatus): string {
    switch (status) {
        case 'upcoming':
            return 'Nadchodzący'
        case 'started':
            return 'Wystartował'
        case 'bonus_confirmed':
            return 'Premia potwierdzona'
        case 'cancelled':
            return 'Anulowany'
    }
}

// ─── Phase 28 follow-up — edit-before-generate at 168h confirmation ─────────
// The manager reviews/edits the two auto-computed bonuses (DL + recruiter) in a
// pre-filled dialog before they are generated and the recipients are notified.

/** Editable values for one placement bonus, supplied by the manager before generation. */
export interface PlacementBonusOverride {
    amount: number
    reason: string
    periodYear: number
    periodMonth: number
    notes?: string | null
}

/**
 * Optional per-recipient overrides accepted by `confirmPlacementHours`. When a side is
 * omitted the action falls back to the computed defaults (unchanged legacy behaviour).
 * An explicit `null` skips generating that recipient's bonus. At least one recipient must
 * remain selected when confirming 168h.
 */
export interface ConfirmPlacementHoursOverrides {
    dl?: PlacementBonusOverride | null
    recruiter?: PlacementBonusOverride | null
}

/**
 * Default DL-bonus reason. Kept byte-identical to the text `confirmPlacementHours`
 * generated before this feature, so an un-touched form reproduces the legacy bonus.
 */
export function defaultDlBonusReason(
    consultantName: string,
    clientName: string,
    monthlyMargin: number,
): string {
    return `Premia DL — placement ${consultantName} @ ${clientName} (${DL_BONUS_PERCENT}% z marży miesięcznej ${Number(monthlyMargin).toLocaleString('pl-PL')} zł)`
}

/** Default recruiter-bonus reason (identical to the pre-edit generated text). */
export function defaultRecruiterBonusReason(
    consultantName: string,
    clientName: string,
    recruiterTier: number,
    marginPerHour: number,
): string {
    return `Premia rekrutacyjna — placement ${consultantName} @ ${clientName} (próg ${recruiterTier}, marża ${Number(marginPerHour)} zł/h)`
}

/** Parse a bonus period {year, month} from an ISO yyyy-mm-dd eligible date. */
export function bonusPeriodFromEligibleDate(eligibleDateISO: string): { year: number; month: number } {
    const [year, month] = eligibleDateISO.split('-').slice(0, 2).map(Number)
    return { year, month }
}
