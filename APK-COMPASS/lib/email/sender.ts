import { logCompat } from '@/lib/logger'
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

interface GraphLike {
    api: (path: string) => {
        post: (body: unknown) => Promise<unknown>
    }
}

let _graphClient: GraphLike | null = null
async function getGraphClient(): Promise<GraphLike> {
    if (_graphClient) return _graphClient
    const tenantId = process.env.AZURE_TENANT_ID
    const clientId = process.env.AZURE_CLIENT_ID
    const clientSecret = process.env.AZURE_CLIENT_SECRET
    if (!tenantId || !clientId || !clientSecret) {
        throw new Error(
            'Microsoft Graph: AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET wymagane.',
        )
    }
    // Imports are dynamic so the bundle does not pull MS Graph SDK on Resend-only deploys.
    const [{ Client }, { ClientSecretCredential }] = await Promise.all([
        import('@microsoft/microsoft-graph-client'),
        import('@azure/identity'),
    ])
    // @ts-expect-error -- isomorphic-fetch has no type declarations; only side-effect import for global fetch polyfill
    await import('isomorphic-fetch')

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
    _graphClient = Client.init({
        authProvider: async (done: (err: Error | null, token: string | null) => void) => {
            try {
                const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default')
                done(null, tokenResponse?.token ?? null)
            } catch (e) {
                done(e as Error, null)
            }
        },
    }) as unknown as GraphLike
    return _graphClient
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
    try {
        const client = await getGraphClient()
        // Graph requires a REAL mailbox in the tenant as sender. The hardcoded
        // `from` in legacy templates (noreply@compass.b2bnetwork.pl, a Resend-only
        // subdomain) is invalid here. Always use MAIL_FROM env var when set, falling
        // back to msg.from only when MAIL_FROM is missing (Resend backwards compat).
        const fromHeader = process.env.MAIL_FROM ?? msg.from ?? getDefaultFrom()
        const fromAddress = fromHeader.replace(/^.*<([^>]+)>.*$/, '$1').trim() // strip "Name <addr>" → "addr"
        await client
            .api(`/users/${encodeURIComponent(fromAddress)}/sendMail`)
            .post({
                message: {
                    subject: msg.subject,
                    body: { contentType: 'HTML', content: msg.html },
                    toRecipients: [{ emailAddress: { address: msg.to } }],
                },
                // Don't save to Sent Items — keeps shared mailbox clean for transactional traffic
                saveToSentItems: false,
            })
        return { success: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_graph_error'
        return { success: false, error: message }
    }
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
