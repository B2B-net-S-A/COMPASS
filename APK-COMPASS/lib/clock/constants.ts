// Phase 17 — shared constants and types for the work-clock feature.
// Kept in a separate module because 'use server' files (server actions) can
// only export async functions.

// Phase 17b R7: bump to v2 because mic/cam permission state detection is a
// new scope that requires re-consent under KP art. 22³ §2.
export const WORK_MONITORING_TERMS_VERSION = 'v2-2026-05-09'

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

/** R3 (Phase 17b): user-explicit pause classification */
export type ClockPauseReason = 'break_30' | 'break_60' | 'break_120' | 'manual'

/** R2 (Phase 17b): a recently auto-closed session that the user can act on via IdleResumeDialog */
export interface RecentlyClosedSession {
    id: string
    ended_at: string
    closed_reason: ClockClosedReason
    active_seconds: number
    started_at: string
}

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
    // Phase 17b R2: merge audit + soft-disregard
    merged_from_session_id?: string | null
    user_disregarded?: boolean
    // Phase 17b R3: pause
    paused_until?: string | null
    pause_reason?: ClockPauseReason | null
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
