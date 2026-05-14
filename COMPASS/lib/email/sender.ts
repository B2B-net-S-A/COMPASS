import * as Sentry from '@sentry/nextjs'
import { logCompat, logger } from '@/lib/logger'
import {
    extractGraphErrorInfo,
    getGraphClient,
    isRetryableGraphStatus,
} from '@/lib/graph/client'
// Phase 17b PR-E — Email provider abstraction.
//
// Note: not marked 'server-only' because lib/email.ts imports this and is
// itself reachable from test files via lib/actions chain. Secrets stay safe
// via Next.js automatic server/client split (this file has no 'use client'
// and only runs from server actions / API routes).
//
// Single send function used by all higher-level templates in lib/email.ts.
// Provider chosen at runtime by MAIL_PROVIDER env var:
//   - 'graph'  → Microsoft Graph API (sendMail) — preferred long-term
//   - 'resend' → Resend SDK — legacy fallback
//   - undefined / anything else → falls back to whatever is configured
//
// Both providers share the same EmailMessage shape, so swap is transparent.
//
// Why a thin abstraction:
//   1. Lets us roll out Graph gradually (set MAIL_PROVIDER=graph in Coolify
//      AFTER Azure App permission + consent are in place; revert to 'resend'
//      instantly if Graph misbehaves)
//   2. Keeps lib/email.ts (14 templates) untouched — they call sendEmail() once
//   3. Future providers (Postmark, SES) plug in here

import type { Resend } from 'resend'

export type MailProvider = 'graph' | 'resend'

export interface EmailMessage {
    /** Single recipient address (most templates send 1:1). For broadcast use sendEmailMany. */
    to: string
    subject: string
    html: string
    /** Optional override; otherwise uses MAIL_FROM env var. */
    from?: string
    /**
     * When true, Graph saves the sent message to the sender mailbox's Sent Items
     * folder. Use for compliance-relevant templates (leave decision, timesheet
     * decision, role change, broadcast). Default false to keep the shared mailbox
     * clean from transactional reminders/alerts.
     */
    saveToSentItems?: boolean
}

export interface SendResult {
    success: boolean
    /** Provider-specific message id when available (Resend id / Graph internetMessageId). */
    messageId?: string
    /** Error message when success=false. */
    error?: string
}

function resolveProvider(): MailProvider {
    const envValue = process.env.MAIL_PROVIDER?.toLowerCase().trim()
    if (envValue === 'graph') return 'graph'
    if (envValue === 'resend') return 'resend'
    // Default: Graph if Azure creds are set, otherwise Resend
    if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
        return 'graph'
    }
    return 'resend'
}

function getDefaultFrom(): string {
    return process.env.MAIL_FROM ?? 'ComPass System <noreply@compass.b2bnetwork.pl>'
}

// ─── Lazy singletons ─────────────────────────────────────────────────────────

let _resend: Resend | null = null
async function getResend(): Promise<Resend> {
    if (!_resend) {
        const { Resend } = await import('resend')
        _resend = new Resend(process.env.RESEND_API_KEY)
    }
    return _resend
}

// ─── Retry helpers ───────────────────────────────────────────────────────────

const MAX_GRAPH_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Recipient domain only, for RODO-safe Sentry tagging. */
function recipientDomain(addr: string): string {
    const idx = addr.indexOf('@')
    return idx === -1 ? 'unknown' : addr.slice(idx + 1).toLowerCase()
}

// ─── Provider implementations ────────────────────────────────────────────────

async function sendViaResend(msg: EmailMessage): Promise<SendResult> {
    try {
        const resend = await getResend()
        const { data, error } = await resend.emails.send({
            from: msg.from ?? getDefaultFrom(),
            to: msg.to,
            subject: msg.subject,
            html: msg.html,
        })
        if (error) {
            return { success: false, error: error.message }
        }
        return { success: true, messageId: data?.id }
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'unknown_resend_error' }
    }
}

/**
 * Microsoft Graph sendMail.
 *
 * The "from" address is the **mailbox** that the message is sent on behalf of.
 * The Application permission `Mail.Send` (with optional Application Access
 * Policy restricting to a single mailbox) determines which mailboxes are
 * allowed. We default to MAIL_FROM env var which should match the policy.
 */
async function sendViaGraph(msg: EmailMessage): Promise<SendResult> {
    const client = await getGraphClient().catch((err) => {
        // Graph client setup failed (credentials missing, network) — not retryable
        return { _setupErr: err }
    })
    if ('_setupErr' in client) {
        const err = (client as { _setupErr: unknown })._setupErr
        return {
            success: false,
            error: err instanceof Error ? err.message : 'unknown_graph_setup_error',
        }
    }

    // Graph requires a REAL mailbox in the tenant as sender. The hardcoded
    // `from` in legacy templates (noreply@compass.b2bnetwork.pl, a Resend-only
    // subdomain) is invalid here. Always use MAIL_FROM env var when set, falling
    // back to msg.from only when MAIL_FROM is missing (Resend backwards compat).
    const fromHeader = process.env.MAIL_FROM ?? msg.from ?? getDefaultFrom()
    const fromAddress = fromHeader.replace(/^.*<([^>]+)>.*$/, '$1').trim() // strip "Name <addr>" → "addr"
    const payload = {
        message: {
            subject: msg.subject,
            body: { contentType: 'HTML', content: msg.html },
            toRecipients: [{ emailAddress: { address: msg.to } }],
        },
        // Compliance-relevant templates (leave/timesheet/role decision, broadcast)
        // opt in via msg.saveToSentItems = true. Default false keeps the shared
        // mailbox clean from reminders/alerts.
        saveToSentItems: msg.saveToSentItems ?? false,
    }

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_GRAPH_ATTEMPTS; attempt++) {
        try {
            await client
                .api(`/users/${encodeURIComponent(fromAddress)}/sendMail`)
                .post(payload)
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)
            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_GRAPH_ATTEMPTS

            if (!retryable || !moreAttempts) {
                break
            }

            const backoff =
                retryAfterMs ??
                BASE_BACKOFF_MS * Math.pow(2, attempt - 1) // 1s, 2s, 4s
            logger.warn({
                event: 'email.graph.retry',
                attempt,
                statusCode,
                backoffMs: backoff,
                recipientDomain: recipientDomain(msg.to),
            })
            await sleep(backoff)
        }
    }

    const message =
        lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    return { success: false, error: message }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Send a single transactional email. Provider is picked at call-time.
 * On failure, returns success=false (does NOT throw — most callers are
 * non-blocking, e.g. cron jobs that should report aggregate counts).
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
    const provider = resolveProvider()
    const result =
        provider === 'graph' ? await sendViaGraph(msg) : await sendViaResend(msg)
    if (!result.success) {
        // Single console line keeps Sentry breadcrumbs clean and grep-able
        logCompat.error(`[email/${provider}] send failed`, {
            to: msg.to,
            subject: msg.subject,
            error: result.error,
        })
        // RODO-safe Sentry capture: never include recipient address or message
        // content (subject can leak PII like names). Tag with provider +
        // recipient domain only so we can pivot in Sentry UI.
        Sentry.captureMessage(`email_send_failed:${provider}`, {
            level: 'error',
            tags: {
                provider,
                recipient_domain: recipientDomain(msg.to),
            },
            extra: {
                error: result.error,
            },
        })
    }
    return result
}

/**
 * Send the same message to many recipients. Sequential by default to avoid
 * Graph throttling (Resend has its own batch endpoint; we do simple loop for
 * provider parity). Returns aggregate counts.
 */
export async function sendEmailMany(
    msg: Omit<EmailMessage, 'to'> & { to: string[] },
): Promise<{ sent: number; failed: number }> {
    let sent = 0
    let failed = 0
    for (const recipient of msg.to) {
        const r = await sendEmail({ ...msg, to: recipient })
        if (r.success) sent++
        else failed++
    }
    return { sent, failed }
}

/** Exposed for tests + diagnostics. */
export const _internals = {
    resolveProvider,
    getDefaultFrom,
}
