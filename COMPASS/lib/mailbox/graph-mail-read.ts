// Phase 26b — Read Microsoft Graph mailbox messages for inbox ingest.
//
// Reads from administracja@b2bnetwork.pl (or any shared mailbox) using
// Application permission `Mail.Read`. Used by /api/cron/inbox-ingest to pull
// new emails every ~5 minutes and turn them into support_tickets.
//
// Requires:
//   - Entra app permission `Mail.Read` (Application) + admin consent
//   - Exchange Online RBAC for Applications:
//       New-ManagementRoleAssignment -App $sp.Identity -Role "Application Mail.Read"
//     (without this Graph returns 403 [RAOP] — same trap as Phase 25 OOF)
//   - Optional defense-in-depth: New-ApplicationAccessPolicy scoping the app
//     to specific mailboxes only.
//
// Soft-fail style: returns {success, error/data} — never throws. Cron decides
// how to surface errors (Sentry capture, write to inbox_sync_state.last_error).

import * as Sentry from '@sentry/nextjs'
import {
    extractGraphErrorInfo,
    getGraphClient,
    isRetryableGraphStatus,
} from '@/lib/graph/client'
import { logger } from '@/lib/logger'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000

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

// ─── Public types ───────────────────────────────────────────────────────────

export interface GraphInternetHeader {
    name: string
    value: string
}

export interface GraphEmailAddress {
    name?: string
    address?: string
}

/** Subset of Graph Message resource we actually consume. */
export interface GraphMessage {
    id: string
    internetMessageId: string | null
    conversationId: string | null
    subject: string | null
    bodyPreview: string | null
    body: {
        contentType: 'html' | 'text'
        content: string
    } | null
    from: { emailAddress?: GraphEmailAddress } | null
    receivedDateTime: string
    hasAttachments: boolean
    isRead: boolean
    internetMessageHeaders: GraphInternetHeader[] | null
}

export interface GraphAttachment {
    id: string
    name: string
    contentType: string
    size: number
    /** base64-encoded bytes — Graph returns full content for fileAttachment kind */
    contentBytes: string
}

export type ListMessagesResult =
    | { success: true; messages: GraphMessage[]; skipped?: boolean }
    | { success: false; error: string }

export type ListAttachmentsResult =
    | { success: true; attachments: GraphAttachment[] }
    | { success: false; error: string }

interface GraphListResponse<T> {
    value: T[]
    '@odata.nextLink'?: string
}

// ─── listNewMessages ────────────────────────────────────────────────────────

const SELECT_FIELDS = [
    'id',
    'internetMessageId',
    'conversationId',
    'subject',
    'bodyPreview',
    'body',
    'from',
    'receivedDateTime',
    'hasAttachments',
    'isRead',
    'internetMessageHeaders',
].join(',')

const DEFAULT_BATCH_SIZE = 50

export interface ListNewMessagesInput {
    /** UPN of the shared mailbox, e.g. 'administracja@b2bnetwork.pl' */
    mailbox: string
    /**
     * Lower bound on receivedDateTime. Inclusive on the API side; ingest
     * dedups on internetMessageId so re-fetching the cursor message is safe.
     */
    since: Date
    /** Max messages per call (Graph max is 1000; default 50 keeps each cron run quick) */
    top?: number
}

/**
 * Fetch new messages from a mailbox since the given cursor. Returns oldest
 * first so the caller can process and advance last_synced_at monotonically.
 *
 * Pagination: we cap at one page (`$top` default 50). If the mailbox sees more
 * than 50 messages per 5-min cron tick this will accumulate backlog, but in
 * practice administracja@ gets <100 emails/day → next tick clears the gap.
 * We never follow @odata.nextLink to bound execution time per cron run.
 */
export async function listNewMessages(
    input: ListNewMessagesInput,
): Promise<ListMessagesResult> {
    if (!credsConfigured()) {
        logger.info({ event: 'inbox.graph.skip_no_credentials', mailbox: input.mailbox })
        return { success: true, messages: [], skipped: true }
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

    const sinceIso = input.since.toISOString()
    const top = input.top ?? DEFAULT_BATCH_SIZE
    // Graph $filter needs single-quoted ISO string with no fractional seconds.
    const filter = `receivedDateTime gt ${sinceIso}`
    const path =
        `/users/${encodeURIComponent(input.mailbox)}/messages` +
        `?$filter=${encodeURIComponent(filter)}` +
        `&$select=${SELECT_FIELDS}` +
        `&$orderby=receivedDateTime asc` +
        `&$top=${top}`

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const resp = (await client.api(path).get()) as GraphListResponse<GraphMessage>
            const messages = Array.isArray(resp?.value) ? resp.value : []
            return { success: true, messages }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)
            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'inbox.graph.list_retry',
                attempt,
                statusCode,
                backoffMs: backoff,
                mailbox: input.mailbox,
            })
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'inbox.graph.list_failed',
        error: message,
        mailbox: input.mailbox,
    })
    Sentry.captureMessage('inbox_list_failed', {
        level: 'warning',
        tags: { kind: 'graph_inbox_list' },
        extra: { mailbox: input.mailbox, error: message },
    })
    return { success: false, error: message }
}

// ─── listAttachments ────────────────────────────────────────────────────────

const ATTACHMENT_SELECT = 'id,name,contentType,size,contentBytes'

/**
 * Fetch all attachments for a message. Only `fileAttachment` kind has
 * `contentBytes` populated; `itemAttachment` (forwarded mail) and
 * `referenceAttachment` (OneDrive link) return without bytes — we skip them.
 *
 * We also cap individual attachment size at 20 MB to avoid memory blowup on
 * worker containers.
 */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export interface ListAttachmentsInput {
    mailbox: string
    messageId: string
}

export async function listAttachments(
    input: ListAttachmentsInput,
): Promise<ListAttachmentsResult> {
    if (!credsConfigured()) {
        return { success: true, attachments: [] }
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

    const path =
        `/users/${encodeURIComponent(input.mailbox)}/messages/${encodeURIComponent(input.messageId)}/attachments` +
        `?$select=${ATTACHMENT_SELECT}`

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const resp = (await client.api(path).get()) as GraphListResponse<
                GraphAttachment & { '@odata.type'?: string }
            >
            const raw = Array.isArray(resp?.value) ? resp.value : []
            const attachments = raw
                .filter(
                    (a) =>
                        a['@odata.type'] === '#microsoft.graph.fileAttachment' &&
                        typeof a.contentBytes === 'string' &&
                        a.size <= MAX_ATTACHMENT_BYTES,
                )
                .map((a) => ({
                    id: a.id,
                    name: a.name,
                    contentType: a.contentType,
                    size: a.size,
                    contentBytes: a.contentBytes,
                }))
            return { success: true, attachments }
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
        event: 'inbox.graph.attachments_failed',
        error: message,
        mailbox: input.mailbox,
        messageId: input.messageId,
    })
    return { success: false, error: message }
}
