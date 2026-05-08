// Phase 17 — shared constants and types for the work-clock feature.
// Kept in a separate module because 'use server' files (server actions) can
// only export async functions.

export const WORK_MONITORING_TERMS_VERSION = 'v1-2026-05-08'

export const HOURS_BLOCKING_ATTENDANCE: readonly string[] = [
    'vacation',
    'sick_leave',
    'parental_leave',
    'unpaid_leave',
]

export type ClockClosedReason =
    | 'manual'
    | 'idle_timeout'
    | 'daily_cutoff'
    | 'sleep_detected'
    | 'taken_over'
    | 'admin_close'

export type ClockLocation = 'onsite' | 'remote'

export interface ClockConsentState {
    hasConsent: boolean
    termsVersion: string | null
    acceptedAt: string | null
    revokedAt: string | null
}

export interface ClockSessionRow {
    id: string
    user_id: string
    started_at: string
    ended_at: string | null
    last_heartbeat: string
    active_seconds: number
    idle_seconds: number
    closed_reason: ClockClosedReason | null
    device_label: string | null
    client_tz: string
    location: ClockLocation
}

export interface ClockSessionLive extends ClockSessionRow {
    ended_at: null
    closed_reason: null
    /** Server-recomputed active_seconds from heartbeats (truth) — may differ from row.active_seconds cache */
    recomputedActiveSeconds: number
    isSustainedIdle: boolean
}

export interface ClockDailyAggregate {
    user_id: string
    work_date: string
    active_seconds: number
    hours: number
    first_clock_in: string
    last_clock_out: string
    session_count: number
}

export interface CorrectionEntryView {
    entry_id: string
    timesheet_id: string
    user_id: string
    user_full_name: string | null
    user_email: string
    work_date: string
    hours: number
    tracked_hours: number | null
    declared_minus_tracked: number | null
    description: string
    project: string | null
    source: 'manual' | 'clock_suggested' | 'clock_accepted'
    created_at: string
}

export interface ClockSessionListItem extends ClockSessionRow {
    duration_minutes: number
}

export interface ClockMonthData {
    year: number
    month: number
    days: ClockDailyAggregate[]
    totalHours: number
    sessionCount: number
}

export interface StartClockInput {
    deviceLabel: string
    clientTz: string
    location?: ClockLocation
}

export interface StartClockResult {
    sessionId: string
    startedAt: string
    location: ClockLocation
    /** True if a previous live session existed and was returned (idempotent re-start). */
    resumedExisting: boolean
}

export interface SuggestEntriesInput {
    timesheetId: string
    /** When true, replaces existing clock_suggested entries; manual ones are kept untouched. */
    overwriteSuggestions?: boolean
}

export interface SuggestEntriesResult {
    inserted: number
    skipped_existing: number
    total_days_with_tracking: number
}

export interface FlagCorrectionInput {
    entryId: string
    declaredHours: number
    trackedHours: number | null
}
