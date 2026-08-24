// Phase 25 — Outlook Out-of-Office automation.
//
// When a leave request is approved we want the consultant's Outlook mailbox to
// auto-reply with a "Jestem na urlopie do DD-MM" message, mentioning who
// substitutes (if assigned). When the leave is cancelled or rejected after
// approval, we revert the auto-reply.
//
// Requires Application permission `MailboxSettings.ReadWrite` granted to the
// Compass Azure App (admin consent). Same client secret as Mail.Send /
// Calendars.ReadWrite.
//
// Soft-fail: every helper returns `{success: false, error}` on failure
// instead of throwing. Approval flow must NEVER be blocked by OOF problems —
// admin sees `graph_sync_error` flag in the queue and can retry manually.

import * as Sentry from '@sentry/nextjs'
import {
    extractGraphErrorInfo,
    getGraphClient,
    isRetryableGraphStatus,
} from '@/lib/graph/client'
import { logger } from '@/lib/logger'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000
const TIMEZONE = 'Europe/Warsaw'

/**
 * Phase 25d marker — embedded as the first line of every OOF message body
 * Compass writes to Outlook. Lets us distinguish "Compass-managed OOF" from
 * "user-set OOF" on re-read, so we never overwrite somebody's own auto-reply.
 *
 * Versioned (v1) so a future format change can be detected if needed.
 */
const COMPASS_OOF_MARKER = '<!-- compass-managed-oof-v1 -->'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function credsConfigured(): boolean {
    return Boolean(
        process.env.AZURE_TENANT_ID &&
            process.env.AZURE_CLIENT_ID &&
            process.env.AZURE_CLIENT_SECRET,
    )
}

/** Stamp a message with the Compass marker if not already present. */
function withCompassMarker(html: string): string {
    if (typeof html !== 'string') return html
    return html.includes(COMPASS_OOF_MARKER) ? html : `${COMPASS_OOF_MARKER}\n${html}`
}

function isCompassManaged(htmlMessage?: string | null): boolean {
    return typeof htmlMessage === 'string' && htmlMessage.includes(COMPASS_OOF_MARKER)
}

export interface SetOutOfOfficeInput {
    /** Mailbox owner — must be a real user in the tenant (UPN/email). */
    userEmail: string
    /** ISO date (YYYY-MM-DD), inclusive. Start of the leave. */
    startDate: string
    /** ISO date (YYYY-MM-DD), inclusive. End of the leave. */
    endDate: string
    /** HTML/text to reply to internal senders. */
    internalReply: string
    /** HTML/text to reply to external senders (`externalAudience='all'`). */
    externalReply: string
}

export type OofSkipReason =
    /** Azure/Graph credentials not configured (dev/local). */
    | 'no_credentials'
    /** Phase 25d — user already set their own OOF; we preserve it. */
    | 'user_custom'

export interface OutOfOfficeResult {
    success: boolean
    error?: string
    /** True when we skipped (e.g. credentials missing, user-managed OOF). Distinct from a real failure. */
    skipped?: boolean
    /** Set when skipped=true. Tells caller WHY we skipped so it can audit/persist. */
    skipReason?: OofSkipReason
}

/** Result of GET /mailboxSettings/automaticRepliesSetting (subset we care about). */
export interface CurrentOofState {
    status: 'disabled' | 'alwaysEnabled' | 'scheduled' | string
    scheduledStartDateTime?: { dateTime: string; timeZone: string } | null
    scheduledEndDateTime?: { dateTime: string; timeZone: string } | null
    internalReplyMessage?: string | null
    externalReplyMessage?: string | null
}

/**
 * Read the user's current automaticRepliesSetting. Returns null on any failure
 * (network, 403, 404). Callers MUST treat null as "unknown → overwrite" to keep
 * the existing Phase 25a behavior on Graph failure (Compass OOF still gets set).
 */
export async function getCurrentOof(userEmail: string): Promise<CurrentOofState | null> {
    if (!credsConfigured()) return null

    let client
    try {
        client = await getGraphClient()
    } catch {
        return null
    }

    try {
        const settings = await client
            .api(`/users/${encodeURIComponent(userEmail)}/mailboxSettings/automaticRepliesSetting`)
            .get()
        if (!settings || typeof settings !== 'object') return null
        return settings as CurrentOofState
    } catch (err) {
        const { statusCode } = extractGraphErrorInfo(err)
        logger.warn({
            event: 'oof.graph.get_failed',
            statusCode,
            userEmail,
            error: err instanceof Error ? err.message : String(err),
        })
        return null
    }
}

/**
 * Phase 25d — should we preserve the user's existing OOF instead of overwriting?
 *
 * Rules:
 *   - status='disabled' → safe to overwrite (no existing OOF).
 *   - Either reply body carries the Compass marker → it's our own OOF from a
 *     previous leave; overwriting is fine.
 *   - status='alwaysEnabled' without marker → user set permanent OOF → preserve.
 *   - status='scheduled' without marker → check scheduledEndDateTime:
 *       end has already passed (vs `now`) → expired user schedule; safe to overwrite.
 *       end is in the future (or unknown) → user has active/upcoming OOF → preserve.
 *
 * Pure function — exported for unit testing.
 */
export function shouldPreserveUserOof(
    current: CurrentOofState | null,
    now: Date = new Date(),
): boolean {
    if (!current) return false // Graph read failed — keep legacy behavior (overwrite).
    if (current.status === 'disabled') return false

    const internalManaged = isCompassManaged(current.internalReplyMessage)
    const externalManaged = isCompassManaged(current.externalReplyMessage)
    if (internalManaged || externalManaged) return false

    if (current.status === 'alwaysEnabled') return true

    if (current.status === 'scheduled') {
        const endIso = current.scheduledEndDateTime?.dateTime
        if (!endIso) return true // active scheduled with unknown end — be conservative.
        const tz = current.scheduledEndDateTime?.timeZone
        // Graph returns ISO without offset; treat tz='UTC' as UTC, anything else
        // (e.g., 'Europe/Warsaw') as a wall-clock that's already past if its
        // UTC interpretation is past — that's conservative but adequate for "expired" check.
        const end = new Date(tz === 'UTC' ? `${endIso}Z` : endIso)
        if (Number.isNaN(end.getTime())) return true
        return end.getTime() > now.getTime()
    }

    // Unknown status value — be conservative, preserve.
    return true
}

/**
 * Schedule an Out-of-Office auto-reply in the user's Outlook mailbox for the
 * date range of the approved leave. Inclusive endDate is bumped to the next
 * day at 00:00 (Graph treats `scheduledEndDateTime` as exclusive midnight).
 */
export async function setOutOfOffice(
    input: SetOutOfOfficeInput,
): Promise<OutOfOfficeResult> {
    if (!credsConfigured()) {
        logger.info({ event: 'oof.graph.skip_no_credentials', userEmail: input.userEmail })
        return { success: true, skipped: true, skipReason: 'no_credentials' }
    }

    // Phase 25d — preserve user-managed OOF. Read current state first; if user
    // has their own auto-reply active (and it's not a previous Compass-managed
    // OOF), skip the PATCH. Graph read failure → fall back to legacy overwrite.
    const current = await getCurrentOof(input.userEmail)
    if (shouldPreserveUserOof(current)) {
        logger.info({
            event: 'oof.graph.skip_user_custom',
            userEmail: input.userEmail,
            currentStatus: current?.status,
            scheduledEnd: current?.scheduledEndDateTime?.dateTime ?? null,
        })
        return { success: true, skipped: true, skipReason: 'user_custom' }
    }

    const endExclusive = addDays(input.endDate, 1)

    const body = {
        automaticRepliesSetting: {
            status: 'scheduled',
            externalAudience: 'all',
            scheduledStartDateTime: {
                dateTime: `${input.startDate}T00:00:00`,
                timeZone: TIMEZONE,
            },
            scheduledEndDateTime: {
                dateTime: `${endExclusive}T00:00:00`,
                timeZone: TIMEZONE,
            },
            internalReplyMessage: withCompassMarker(input.internalReply),
            externalReplyMessage: withCompassMarker(input.externalReply),
        },
    }

    let client
    try {
        client = await getGraphClient()
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'graph_client_setup_failed',
        }
    }

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await client
                .api(`/users/${encodeURIComponent(input.userEmail)}/mailboxSettings`)
                .patch(body)
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'oof.graph.retry',
                attempt,
                statusCode,
                backoffMs: backoff,
                userEmail: input.userEmail,
            })
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'oof.graph.set_failed',
        error: message,
        userEmail: input.userEmail,
    })
    Sentry.captureMessage('oof_set_failed', {
        level: 'warning',
        tags: { kind: 'graph_oof_set' },
        extra: { userEmail: input.userEmail, error: message },
    })
    return { success: false, error: message }
}

export interface DisableOutOfOfficeInput {
    userEmail: string
}

/**
 * Disable the user's auto-reply. Used when a previously-approved leave is
 * cancelled or rejected. Idempotent — Graph accepts status=disabled even when
 * no schedule was active.
 */
export async function disableOutOfOffice(
    input: DisableOutOfOfficeInput,
): Promise<OutOfOfficeResult> {
    if (!credsConfigured()) {
        return { success: true, skipped: true, skipReason: 'no_credentials' }
    }

    let client
    try {
        client = await getGraphClient()
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'graph_client_setup_failed',
        }
    }

    const body = {
        automaticRepliesSetting: {
            status: 'disabled',
        },
    }

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await client
                .api(`/users/${encodeURIComponent(input.userEmail)}/mailboxSettings`)
                .patch(body)
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)
            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'oof.graph.disable_failed',
        error: message,
        userEmail: input.userEmail,
    })
    Sentry.captureMessage('oof_disable_failed', {
        level: 'warning',
        tags: { kind: 'graph_oof_disable' },
        extra: { userEmail: input.userEmail, error: message },
    })
    return { success: false, error: message }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// Phase 53: the default message templates (buildDefaultOofMessages) moved to
// ./oof-template.ts — a pure module the form preview action can also import.

function addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}
