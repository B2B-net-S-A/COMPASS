// Phase 26b/26c — Read Microsoft 365 Group conversations for inbox ingest.
//
// administracja@b2bnetwork.pl turned out to be a Microsoft 365 Group
// (Unified Group / GroupMailbox), NOT a user/shared mailbox. Mail.Read User API
// does not work on group mailboxes; we must use the Groups Conversations API
// instead:
//
//   GET /groups/{groupId}/threads?$filter=lastDeliveredDateTime gt {cursor}
//   GET /groups/{groupId}/threads/{threadId}/posts
//   GET /groups/{groupId}/threads/{threadId}/posts/{postId}/attachments
//
// Requires:
//   - Entra app permission `Group.Read.All` (Application) + admin consent
//   - Exchange Online RBAC: `Application Mail.Read` (RAOP gate; Groups use
//     EXO mailbox semantics under the hood)
//   - ApplicationAccessPolicy (CompassMailSenders DL): the target group must
//     be a member, otherwise RAOP returns 403 even with the role granted
//
// Each post within a thread is mapped to a synthetic "message" so that the
// downstream ingest pipeline (lib/inbox/ingest.ts) can stay unchanged. The
// thread id is reused as `conversationId` — replies in the same thread match
// the same ticket and append as a comment.

import * as Sentry from '@sentry/nextjs'
import {
    extractGraphErrorInfo,
    getGraphClient,
    isRetryableGraphStatus,
} from '@/lib/graph/client'
import { logger } from '@/lib/logger'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const DEFAULT_THREAD_BATCH = 25
const DEFAULT_POST_BATCH = 50

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

/**
 * Synthetic message shape — same fields as legacy User-mailbox GraphMessage so
 * ingest pipeline doesn't need to know whether the source was a user mailbox
 * or a M365 Group conversation post.
 */
export interface GraphMessage {
    id: string
    internetMessageId: string | null
    /** Always set to thread.id for group posts — enables thread matching. */
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

// ─── Graph API raw shapes ───────────────────────────────────────────────────

interface GraphThread {
    id: string
    topic: string | null
    hasAttachments: boolean
    lastDeliveredDateTime: string
}

interface GraphPost {
    id: string
    createdDateTime: string
    receivedDateTime?: string
    hasAttachments: boolean
    body: {
        contentType: 'html' | 'text'
        content: string
    } | null
    from: { emailAddress?: GraphEmailAddress } | null
    sender: { emailAddress?: GraphEmailAddress } | null
}

// ─── Resolution: mailbox SMTP → groupId ─────────────────────────────────────

const groupIdCache = new Map<string, string>()

/**
 * Resolve a group SMTP/UPN-shaped mailbox to its Graph object id.
 *
 * For administracja@b2bnetwork.pl the formal address in Entra is the tenant
 * default `Administracja@b2bnetsa.onmicrosoft.com`; users still type the
 * b2bnetwork.pl alias. We accept either form, try mail filter first, then
 * mailNickname (`Administracja`), then `displayName`.
 *
 * Accepts an explicit env override `INBOX_PRIMARY_GROUP_ID` to skip lookup
 * (faster + works even when Group.Read.All hasn't propagated yet).
 */
export async function resolveGroupId(mailbox: string): Promise<string | null> {
    const cached = groupIdCache.get(mailbox.toLowerCase())
    if (cached) return cached

    const override = process.env.INBOX_PRIMARY_GROUP_ID
    if (override) {
        groupIdCache.set(mailbox.toLowerCase(), override)
        return override
    }

    if (!credsConfigured()) return null

    let client
    try {
        client = await getGraphClient()
    } catch {
        return null
    }

    const nick = mailbox.split('@')[0]
    const queries = [
        `/groups?$filter=${encodeURIComponent(`mail eq '${mailbox}'`)}&$select=id,mail`,
        `/groups?$filter=${encodeURIComponent(`mailNickname eq '${nick}'`)}&$select=id,mail`,
        `/groups?$filter=${encodeURIComponent(`displayName eq '${nick}'`)}&$select=id,mail`,
    ]

    for (const path of queries) {
        try {
            const resp = (await client.api(path).get()) as GraphListResponse<{ id: string; mail: string | null }>
            const hit = resp?.value?.[0]
            if (hit?.id) {
                groupIdCache.set(mailbox.toLowerCase(), hit.id)
                return hit.id
            }
        } catch (err) {
            logger.warn({
                event: 'inbox.graph.group_resolve_failed',
                mailbox,
                error: err instanceof Error ? err.message : String(err),
            })
        }
    }
    return null
}

// ─── listNewMessages ────────────────────────────────────────────────────────

const THREAD_SELECT = 'id,topic,hasAttachments,lastDeliveredDateTime'
const POST_SELECT = 'id,createdDateTime,receivedDateTime,hasAttachments,body,from,sender'

export interface ListNewMessagesInput {
    /** SMTP/UPN-style identifier — resolved to a group id internally. */
    mailbox: string
    /** Lower bound on post createdDateTime. Inclusive — dedup happens via post id. */
    since: Date
    /** Soft cap on threads we scan per tick. Default 25 keeps each tick well under maxDuration. */
    topThreads?: number
}

/**
 * Pull every post created since `since` across active threads in the group.
 *
 * Pagination: we cap at one page of threads (default 25) and one page of posts
 * per thread (default 50). Cron tick is every 5 minutes — at ~50 emails/day
 * volume on administracja@ this leaves enormous headroom. Heavier traffic
 * would accumulate backlog; the next tick clears it.
 */
export async function listNewMessages(
    input: ListNewMessagesInput,
): Promise<ListMessagesResult> {
    if (!credsConfigured()) {
        logger.info({ event: 'inbox.graph.skip_no_credentials', mailbox: input.mailbox })
        return { success: true, messages: [], skipped: true }
    }

    const groupId = await resolveGroupId(input.mailbox)
    if (!groupId) {
        return {
            success: false,
            error: `group_not_found: ${input.mailbox} (set INBOX_PRIMARY_GROUP_ID env var if Group.Read.All not granted yet)`,
        }
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
    const topThreads = input.topThreads ?? DEFAULT_THREAD_BATCH
    const threadFilter = `lastDeliveredDateTime gt ${sinceIso}`
    const threadsPath =
        `/groups/${encodeURIComponent(groupId)}/threads` +
        `?$filter=${encodeURIComponent(threadFilter)}` +
        `&$select=${THREAD_SELECT}` +
        `&$orderby=lastDeliveredDateTime asc` +
        `&$top=${topThreads}`

    const threads = await fetchWithRetry<GraphListResponse<GraphThread>>(client, threadsPath, input.mailbox, 'list_threads')
    if (!threads.ok) return { success: false, error: threads.error }
    const threadList = threads.data.value ?? []

    const messages: GraphMessage[] = []
    for (const thread of threadList) {
        const postsRes = await fetchPostsForThread(client, groupId, thread, input.mailbox, sinceIso)
        if (!postsRes.ok) {
            // Best-effort: one failing thread shouldn't sink the whole tick.
            logger.warn({
                event: 'inbox.graph.thread_posts_failed',
                threadId: thread.id,
                error: postsRes.error,
            })
            continue
        }
        for (const post of postsRes.posts) {
            messages.push(mapPostToMessage(post, thread))
        }
    }

    // Caller expects ascending order so the cursor advances monotonically.
    messages.sort(
        (a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime(),
    )

    return { success: true, messages }
}

async function fetchPostsForThread(
    client: { api: (path: string) => { get: () => Promise<unknown> } },
    groupId: string,
    thread: GraphThread,
    mailbox: string,
    sinceIso: string,
): Promise<{ ok: true; posts: GraphPost[] } | { ok: false; error: string }> {
    const path =
        `/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(thread.id)}/posts` +
        `?$select=${POST_SELECT}` +
        `&$top=${DEFAULT_POST_BATCH}`

    const res = await fetchWithRetry<GraphListResponse<GraphPost>>(
        client,
        path,
        mailbox,
        `list_posts_${thread.id.slice(0, 8)}`,
    )
    if (!res.ok) return res

    const sinceDate = new Date(sinceIso)
    const filtered = (res.data.value ?? []).filter((p) => {
        const ts = new Date(p.createdDateTime)
        return ts > sinceDate
    })
    return { ok: true, posts: filtered }
}

function mapPostToMessage(post: GraphPost, thread: GraphThread): GraphMessage {
    const received = post.receivedDateTime ?? post.createdDateTime
    return {
        id: post.id,
        // Posts on group threads do not expose internetMessageId in the
        // standard payload — we synthesize one so dedupe still works.
        internetMessageId: `${thread.id}/${post.id}`,
        conversationId: thread.id,
        subject: thread.topic,
        bodyPreview: previewFromBody(post.body),
        body: post.body ?? null,
        from: post.from ?? post.sender ?? null,
        receivedDateTime: received,
        hasAttachments: post.hasAttachments,
        isRead: false,
        // Groups Conversations API doesn't include internetMessageHeaders on
        // posts. Filters that depend on Auto-Submitted/X-Auto-Response-Suppress
        // need to fall back to sender-based heuristics (handled in filters.ts).
        internetMessageHeaders: null,
    }
}

function previewFromBody(body: GraphPost['body']): string | null {
    if (!body?.content) return null
    if (body.contentType === 'text') {
        return body.content.slice(0, 255)
    }
    return body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 255)
}

// ─── listAttachments ────────────────────────────────────────────────────────

const ATTACHMENT_SELECT = 'id,name,contentType,size,contentBytes'

export interface ListAttachmentsInput {
    /** Mailbox UPN/SMTP, resolved to group id internally. */
    mailbox: string
    /** Synthetic id from mapPostToMessage — format `${threadId}/${postId}`. */
    messageId: string
}

/**
 * Fetch all file-attachments for a post. Synthetic message id encodes both
 * thread and post; we split to build the Graph URL.
 */
export async function listAttachments(
    input: ListAttachmentsInput,
): Promise<ListAttachmentsResult> {
    if (!credsConfigured()) {
        return { success: true, attachments: [] }
    }

    const slash = input.messageId.indexOf('/')
    if (slash < 0) {
        return { success: false, error: 'invalid_message_id' }
    }
    const threadId = input.messageId.slice(0, slash)
    const postId = input.messageId.slice(slash + 1)

    const groupId = await resolveGroupId(input.mailbox)
    if (!groupId) {
        return { success: false, error: `group_not_found: ${input.mailbox}` }
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
        `/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(threadId)}/posts/${encodeURIComponent(postId)}/attachments` +
        `?$select=${ATTACHMENT_SELECT}`

    const res = await fetchWithRetry<GraphListResponse<GraphAttachment & { '@odata.type'?: string }>>(
        client,
        path,
        input.mailbox,
        'list_attachments',
    )
    if (!res.ok) return { success: false, error: res.error }

    const raw = res.data.value ?? []
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
}

// ─── Internal retry helper ──────────────────────────────────────────────────

async function fetchWithRetry<T>(
    client: { api: (path: string) => { get: () => Promise<unknown> } },
    path: string,
    mailbox: string,
    op: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const resp = (await client.api(path).get()) as T
            return { ok: true, data: resp }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)
            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'inbox.graph.retry',
                op,
                attempt,
                statusCode,
                backoffMs: backoff,
                mailbox,
            })
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({ event: `inbox.graph.${op}_failed`, error: message, mailbox })
    Sentry.captureMessage(`inbox_${op}_failed`, {
        level: 'warning',
        tags: { kind: 'graph_inbox' },
        extra: { mailbox, op, error: message },
    })
    return { ok: false, error: message }
}
