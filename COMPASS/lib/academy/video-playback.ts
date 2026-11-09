export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const

/** Eight attempts with the delays below give about 90 s for a network outage to pass. */
export const MAX_RECOVERY_ATTEMPTS = 8
const RECOVERED_AFTER_SECONDS = 5

/**
 * Chrome keeps retrying a dead range request for minutes without firing `error`,
 * so a player waiting for data this long with none arriving is treated as failed.
 */
export const STALL_TIMEOUT_MS = 12_000

/** The first retry is immediate: the usual cause is an expired signed URL, not the network. */
export function recoveryDelayMs(attempt: number): number {
    if (attempt <= 1) return 0
    return Math.min(30_000, 1000 * 2 ** (attempt - 2))
}

/**
 * Playback must really move past the failure before the retry budget is restored.
 * Reaching `loadedmetadata` is not enough, because a damaged file loads and fails again.
 */
export function hasRecovered(errorPosition: number, currentPosition: number): boolean {
    return currentPosition - errorPosition >= RECOVERED_AFTER_SECONDS
}
