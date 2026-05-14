// Phase 17b R3 — Pure pause/resume helpers.
// Server actions in lib/actions/internal-clock.ts call validatePauseDurationMinutes
// and calculatePausedUntil before writing to work_clock_session_pauses.

import type { ClockPauseReason } from './constants'

export const MIN_PAUSE_MINUTES = 1
export const MAX_PAUSE_MINUTES = 480

export interface PauseClockInput {
    sessionId: string
    /** 30/60/120 are the preset break buttons; other values supported for "manual". */
    durationMinutes: number
    reason: ClockPauseReason
}

export interface PauseClockResult {
    pausedUntil: string
    pauseReason: ClockPauseReason
}

/**
 * Throw a Polish-language error when the requested pause duration is outside
 * the allowed range. NaN/Infinity are treated as invalid.
 */
export function validatePauseDurationMinutes(minutes: number): void {
    if (
        !Number.isFinite(minutes) ||
        minutes < MIN_PAUSE_MINUTES ||
        minutes > MAX_PAUSE_MINUTES
    ) {
        throw new Error(
            `Czas pauzy musi być w zakresie ${MIN_PAUSE_MINUTES}-${MAX_PAUSE_MINUTES} minut.`,
        )
    }
}

/**
 * Compute the ISO timestamp at which an active pause should auto-resume.
 *
 * @param durationMinutes - validated via validatePauseDurationMinutes upstream
 * @param nowMs - injectable clock for tests; defaults to Date.now()
 */
export function calculatePausedUntil(
    durationMinutes: number,
    nowMs: number = Date.now(),
): string {
    return new Date(nowMs + durationMinutes * 60 * 1000).toISOString()
}
