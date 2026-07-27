// Overlap guard for the inbox ingest.
//
// The ingest advances its cursor only at the very end of a run. That is fine when
// runs are short, but once there is a backlog each run works the full `maxDuration`
// (four minutes) while the cron fires every five — and a tick that starts before the
// previous one has written its cursor reads the OLD cursor, fetches the same 50
// messages again, and throws them all away as duplicates.
//
// Observed on 2026-07-27, right after the Coolify scheduler was repaired and the
// ingest began catching up: 11:55 → 50 created, 12:00 → 0 (50 duplicates),
// 12:05 → 47 created. Every other tick burned four minutes and 50 Graph calls, and
// filled `last_error` with 50 entries while the import was in fact perfectly healthy.
//
// Pure and deterministic (`nowMs` injected) so the expiry boundary is testable.

/**
 * How long a claimed run may look "in progress" before we assume it died.
 *
 * Comfortably above the route's `maxDuration` of 240 s. The point is that the lock
 * expires on its own: a run killed by the runtime never writes `last_run_at`, and
 * without expiry it would block the ingest forever — a worse failure than the
 * double-fetch it prevents.
 */
export const STALE_RUN_MS = 10 * 60 * 1000

/**
 * Is a previous ingest run still working?
 *
 * `run_started_at` is written before the work, `last_run_at` after it, so their
 * order tells the two apart: a start with no newer finish means "running".
 */
export function isRunInProgress(
    runStartedAt: string | null | undefined,
    lastRunAt: string | null | undefined,
    nowMs: number,
): boolean {
    if (!runStartedAt) return false

    const started = Date.parse(runStartedAt)
    if (Number.isNaN(started)) return false

    // Expired claim — treat as dead regardless of what last_run_at says.
    if (nowMs - started > STALE_RUN_MS) return false

    // A finish at or after the start means that run completed.
    if (lastRunAt) {
        const finished = Date.parse(lastRunAt)
        if (!Number.isNaN(finished) && finished >= started) return false
    }

    return true
}
