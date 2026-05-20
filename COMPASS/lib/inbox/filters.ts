// Phase 26b/26c — Noise filters for inbox email ingest.
//
// Skrzynka administracja@b2bnetwork.pl (Microsoft 365 Group) dostaje też:
//   - Auto-reply Out-of-Office od odbiorców naszych emaili
//   - Bounce/NDR (non-delivery reports) z mailer-daemon / postmaster
//   - Wewnętrzne notyfikacje: GitHub PR notifications, Sentry alerts,
//     Coolify deployment status, M365 admin notifications
//
// User decided in Phase 26b scope: filter ALL three categories, but do NOT
// filter messages from b2bnetwork.pl employees (they may legitimately send
// requests to administracja@ from their work account).
//
// IMPORTANT: Microsoft 365 Group conversation posts do NOT expose
// internetMessageHeaders — header-based heuristics (Auto-Submitted, Precedence,
// X-Auto-Response-Suppress) silently return false. Sender-based fallbacks
// (mailer-daemon / postmaster / noreply localparts, known noise domains)
// continue to work and catch the majority of cases. Edge: a custom-text OOF
// from an external client could slip through; handler can close such tickets.
//
// Functions return SkipReason for ingest audit log; null means "keep".

import type { GraphInternetHeader, GraphMessage } from '@/lib/mailbox/graph-mail-read'

export type SkipReason =
    | 'ndr_bounce'
    | 'auto_reply'
    | 'internal_noise'
    | 'no_sender'
    | 'missing_subject_and_body'

interface InternalNoisePattern {
    domain: string
    label: string
}

// Sources of automated mail we explicitly drop. Match `@domain` (suffix) so
// `noreply@sentry.io` matches `sentry.io` entry.
const INTERNAL_NOISE_DOMAINS: InternalNoisePattern[] = [
    { domain: 'sentry.io', label: 'sentry' },
    { domain: 'sentry-mail.com', label: 'sentry' },
    { domain: 'github.com', label: 'github' },
    { domain: 'noreply.github.com', label: 'github' },
    { domain: 'coollabs.io', label: 'coolify' },
    { domain: 'coolify.io', label: 'coolify' },
    { domain: 'microsoftonline.com', label: 'm365' },
    { domain: 'protection.outlook.com', label: 'm365' },
    { domain: 'azure.com', label: 'azure' },
    { domain: 'supabase.io', label: 'supabase' },
    { domain: 'supabase.com', label: 'supabase' },
    { domain: 'vercel.com', label: 'vercel' },
    { domain: 'cloudflare.com', label: 'cloudflare' },
    { domain: 'mailchimp.com', label: 'marketing' },
    { domain: 'sendgrid.net', label: 'transactional_smtp' },
    { domain: 'amazonses.com', label: 'transactional_smtp' },
]

const NDR_SENDER_LOCALPARTS = [
    'mailer-daemon',
    'postmaster',
    'mailerdaemon',
    'do-not-reply',
    'donotreply',
    'noreply',
    'no-reply',
    'bounces',
    'bounce',
]

function getHeader(headers: GraphInternetHeader[] | null | undefined, name: string): string | null {
    if (!headers) return null
    const target = name.toLowerCase()
    for (const h of headers) {
        if (h.name?.toLowerCase() === target) return h.value ?? null
    }
    return null
}

function getSenderAddress(msg: GraphMessage): string | null {
    return msg.from?.emailAddress?.address?.toLowerCase().trim() ?? null
}

function getSenderLocalpart(msg: GraphMessage): string | null {
    const addr = getSenderAddress(msg)
    if (!addr) return null
    const at = addr.indexOf('@')
    if (at <= 0) return null
    return addr.slice(0, at)
}

function getSenderDomain(msg: GraphMessage): string | null {
    const addr = getSenderAddress(msg)
    if (!addr) return null
    const at = addr.indexOf('@')
    if (at < 0 || at === addr.length - 1) return null
    return addr.slice(at + 1)
}

// ─── Individual checks ──────────────────────────────────────────────────────

export function isNonDeliveryReport(msg: GraphMessage): boolean {
    const localpart = getSenderLocalpart(msg)
    if (localpart && NDR_SENDER_LOCALPARTS.includes(localpart)) return true

    // Auto-Submitted: auto-replied OR Microsoft DSN content-type
    const contentClass = getHeader(msg.internetMessageHeaders, 'Content-Class')
    if (contentClass?.toLowerCase().includes('dsn')) return true

    const reportType = getHeader(msg.internetMessageHeaders, 'X-Failed-Recipients')
    if (reportType) return true

    return false
}

export function isAutoReply(msg: GraphMessage): boolean {
    const autoSubmitted = getHeader(msg.internetMessageHeaders, 'Auto-Submitted')
    if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') {
        // auto-generated, auto-replied — all signal automated
        return true
    }

    const autoResponse = getHeader(msg.internetMessageHeaders, 'X-Auto-Response-Suppress')
    if (autoResponse) return true

    // Some Outlook OOF replies surface as X-MS-Exchange-Inbox-Rules-Loop
    if (getHeader(msg.internetMessageHeaders, 'X-MS-Exchange-Inbox-Rules-Loop')) return true

    // RFC 3834 explicit auto-reply class
    const precedence = getHeader(msg.internetMessageHeaders, 'Precedence')
    if (precedence && ['auto_reply', 'bulk', 'list', 'junk'].includes(precedence.toLowerCase())) {
        return true
    }

    return false
}

export function isInternalNoise(msg: GraphMessage): { match: boolean; label?: string } {
    const domain = getSenderDomain(msg)
    if (!domain) return { match: false }

    for (const pattern of INTERNAL_NOISE_DOMAINS) {
        if (domain === pattern.domain || domain.endsWith(`.${pattern.domain}`)) {
            return { match: true, label: pattern.label }
        }
    }
    return { match: false }
}

// ─── Aggregate classifier used by ingest pipeline ───────────────────────────

export interface SkipDecision {
    skip: boolean
    reason?: SkipReason
    details?: string
}

/**
 * Final decision whether to ingest this message. Order matters — cheaper
 * checks first so we short-circuit on obvious noise.
 */
export function classifyMessage(msg: GraphMessage): SkipDecision {
    if (!getSenderAddress(msg)) {
        return { skip: true, reason: 'no_sender' }
    }

    if (isNonDeliveryReport(msg)) {
        return { skip: true, reason: 'ndr_bounce' }
    }

    if (isAutoReply(msg)) {
        return { skip: true, reason: 'auto_reply' }
    }

    const noise = isInternalNoise(msg)
    if (noise.match) {
        return { skip: true, reason: 'internal_noise', details: noise.label }
    }

    const subject = (msg.subject ?? '').trim()
    const preview = (msg.bodyPreview ?? '').trim()
    if (subject.length === 0 && preview.length === 0) {
        return { skip: true, reason: 'missing_subject_and_body' }
    }

    return { skip: false }
}
