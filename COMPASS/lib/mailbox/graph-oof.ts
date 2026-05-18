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

export interface OutOfOfficeResult {
    success: boolean
    error?: string
    /** True when we skipped (e.g. credentials missing). Distinct from a real failure. */
    skipped?: boolean
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
        return { success: true, skipped: true }
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
            internalReplyMessage: input.internalReply,
            externalReplyMessage: input.externalReply,
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
        return { success: true, skipped: true }
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

export interface BuildDefaultOofInput {
    employeeName: string
    endDate: string // YYYY-MM-DD
    substituteName?: string | null
    substituteEmail?: string | null
}

/**
 * Generate a polished bilingual (PL+EN) default OOF message when the user
 * doesn't provide custom text. Mentions the substitute if assigned.
 */
export function buildDefaultOofMessages(input: BuildDefaultOofInput): {
    internal: string
    external: string
} {
    const formattedDate = formatPolishDate(input.endDate)
    const hasSubstitute = Boolean(input.substituteName && input.substituteEmail)
    const subPart = hasSubstitute
        ? `W pilnych sprawach prosimy o kontakt z <strong>${escapeHtml(input.substituteName!)}</strong> (<a href="mailto:${escapeHtml(input.substituteEmail!)}">${escapeHtml(input.substituteEmail!)}</a>).`
        : 'W pilnych sprawach prosimy o kontakt z managerem zespołu.'

    const subPartEn = hasSubstitute
        ? `For urgent matters please contact <strong>${escapeHtml(input.substituteName!)}</strong> (<a href="mailto:${escapeHtml(input.substituteEmail!)}">${escapeHtml(input.substituteEmail!)}</a>).`
        : 'For urgent matters please contact the team manager.'

    const internal = `<p>Dzień dobry,</p>
<p>Jestem nieobecny/-a do <strong>${formattedDate}</strong>. ${subPart}</p>
<hr/>
<p>Hello,</p>
<p>I'm out of office until <strong>${formattedDate}</strong>. ${subPartEn}</p>
<p>— ${escapeHtml(input.employeeName)}</p>`

    const external = internal // identical for now; admin can customize per leave
    return { internal, external }
}

function formatPolishDate(iso: string): string {
    const months = [
        'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
        'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
    ]
    const [year, month, day] = iso.split('-')
    return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]} ${year}`
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

function addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}
