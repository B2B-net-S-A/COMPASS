// Phase 26b/26c — Email ingest pipeline for inbox kanban.
//
// Called from /api/cron/inbox-ingest. Service-role context (RLS bypassed) —
// must do its own authorisation by virtue of running only behind withCronAuth.
//
// Phase 26c: administracja@b2bnetwork.pl turned out to be a Microsoft 365 Group
// (GroupMailbox). The Graph helper now reads /groups/{id}/threads/posts. Each
// `post` is mapped to a synthetic GraphMessage (with `conversationId = thread.id`),
// so this pipeline stays identical: dedupe on internetMessageId, match by
// conversationId, append-or-create.
//
// Flow per mailbox tick:
//   1. Load inbox_sync_state cursor (last_synced_at)
//   2. Call Graph: listNewMessages(mailbox, since=cursor) — resolves group id
//      under the hood and pulls threads+posts created after cursor
//   3. For each post-as-message, in order:
//        a. classifyMessage → if skip, log + write meta with email_skip_reason
//        b. dedupe by internetMessageId (synthetic `${threadId}/${postId}`)
//        c. find existing ticket by external_conversation_id (= thread.id)
//             - HIT: append comment + reopen if resolved/closed
//             - MISS: create new ticket
//        d. download + upload attachments to inbox-attachments/{ticket_id}/
//        e. advance cursor to max(receivedDateTime)
//   4. Write final inbox_sync_state row with stats
//
// Soft-fail per message: one bad email doesn't break the whole tick.

import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { Buffer } from 'node:buffer'

import { logger } from '@/lib/logger'
import { computeDueDate } from '@/lib/utils/sla'
import { INBOX_CATEGORY_SLUGS } from '@/lib/types/support'
import {
    listAttachments,
    listNewMessages,
    type GraphInternetHeader,
    type GraphMessage,
    type MailboxKind,
} from '@/lib/mailbox/graph-mail-read'
import { classifyMessage, type SkipReason } from './filters'

// Public so cron route can announce the mailbox in its response body.
// Phase 26d — pivot to shared mailbox (RAOP cache wouldn't refresh for the
// M365 Group). Real ingress is now compass-tickets@b2bnetwork.pl, fed by an
// EXO transport rule BCC-ing every administracja@ message.
export const PRIMARY_INBOX_MAILBOX = 'compass-tickets@b2bnetwork.pl'

export interface IngestStats {
    mailbox: string
    scanned: number
    created: number
    appended: number
    reopened: number
    skipped: number
    skippedByReason: Record<string, number>
    errors: string[]
    lastSyncedAt: string | null
    durationMs: number
}

interface IngestDeps {
    admin: SupabaseClient
}

const NOISE_HEADERS_TO_KEEP = [
    'auto-submitted',
    'precedence',
    'x-auto-response-suppress',
    'content-class',
    'x-failed-recipients',
    'x-ms-exchange-inbox-rules-loop',
    'x-mailer',
    'list-unsubscribe',
    'message-id',
    'in-reply-to',
    'references',
]

function trimHeaders(headers: GraphInternetHeader[] | null): GraphInternetHeader[] | null {
    if (!headers) return null
    const keep = headers.filter((h) =>
        NOISE_HEADERS_TO_KEEP.includes(h.name?.toLowerCase() ?? ''),
    )
    return keep.length > 0 ? keep : null
}

function buildAppendCommentBody(msg: GraphMessage): string {
    const from = msg.from?.emailAddress?.address ?? 'unknown'
    const fromName = msg.from?.emailAddress?.name
    const received = msg.receivedDateTime
    const fromLabel = fromName ? `${fromName} <${from}>` : from
    const text = (msg.body?.contentType === 'text' ? msg.body.content : null) ?? msg.bodyPreview ?? ''
    const truncatedText = text.length > 4000 ? `${text.slice(0, 4000)}\n\n[…truncated]` : text
    return `📧 **Email od ${fromLabel}** (${received})\n\n${truncatedText}`
}

/** Choose a placeholder user_id for ingested tickets — required by support_tickets NOT NULL. */
async function getInboxBotUserId(admin: SupabaseClient): Promise<string | null> {
    const envOverride = process.env.INBOX_INGEST_USER_ID
    if (envOverride) return envOverride

    const { data } = await admin
        .from('profiles')
        .select('id')
        .or('role.eq.admin,is_inbox_handler.eq.true')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    return (data as { id: string } | null)?.id ?? null
}

interface CategoryRow {
    id: string
    slug: string
}

async function getInboxCategories(
    admin: SupabaseClient,
): Promise<Map<string, string>> {
    const { data } = await admin
        .from('support_categories')
        .select('id, slug')
        .in('slug', INBOX_CATEGORY_SLUGS as unknown as string[])
    const map = new Map<string, string>()
    for (const c of (data ?? []) as CategoryRow[]) {
        map.set(c.slug, c.id)
    }
    return map
}

interface ExistingTicketMatch {
    ticketId: string
    status: string
    assigneeId: string | null
}

async function findTicketByConversation(
    admin: SupabaseClient,
    conversationId: string | null,
): Promise<ExistingTicketMatch | null> {
    if (!conversationId) return null
    const { data: meta } = await admin
        .from('support_inbox_meta')
        .select('ticket_id')
        .eq('external_conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (!meta) return null
    const ticketId = (meta as { ticket_id: string }).ticket_id

    const { data: ticket } = await admin
        .from('support_tickets')
        .select('id, status, assignee_id')
        .eq('id', ticketId)
        .maybeSingle()
    if (!ticket) return null
    const t = ticket as { id: string; status: string; assignee_id: string | null }
    return { ticketId: t.id, status: t.status, assigneeId: t.assignee_id }
}

async function alreadyIngested(
    admin: SupabaseClient,
    internetMessageId: string,
): Promise<boolean> {
    const { data } = await admin
        .from('support_inbox_meta')
        .select('ticket_id')
        .eq('external_message_id', internetMessageId)
        .maybeSingle()
    return Boolean(data)
}

async function writeAudit(
    admin: SupabaseClient,
    action: string,
    details: Record<string, unknown>,
): Promise<void> {
    try {
        await admin.from('audit_logs').insert({
            user_id: null,
            action,
            details,
            ip_address: 'cron:inbox-ingest',
        })
    } catch (e) {
        logger.warn({ event: 'inbox.audit_failed', action, error: String(e) })
    }
}

interface UploadedAttachment {
    name: string
    size: number
    storagePath: string
    contentType: string
}

async function uploadAttachments(
    admin: SupabaseClient,
    ticketId: string,
    mailbox: string,
    kind: MailboxKind,
    messageId: string,
    hasAttachments: boolean,
): Promise<{ uploaded: UploadedAttachment[]; errors: string[] }> {
    if (!hasAttachments) return { uploaded: [], errors: [] }

    const res = await listAttachments({ mailbox, kind, messageId })
    if (!res.success) {
        return { uploaded: [], errors: [`attachments_list_failed: ${res.error}`] }
    }

    const uploaded: UploadedAttachment[] = []
    const errors: string[] = []

    for (const a of res.attachments) {
        try {
            const buffer = Buffer.from(a.contentBytes, 'base64')
            // Sanitize filename — keep extension, replace path separators and
            // spaces (Supabase storage paths don't like raw spaces / slashes).
            const safeName = a.name.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
            const path = `${ticketId}/${Date.now()}_${safeName}`
            const { error } = await admin.storage
                .from('inbox-attachments')
                .upload(path, buffer, {
                    contentType: a.contentType,
                    upsert: false,
                })
            if (error) {
                errors.push(`upload_failed:${a.name}: ${error.message}`)
                continue
            }
            uploaded.push({
                name: a.name,
                size: a.size,
                storagePath: path,
                contentType: a.contentType,
            })
        } catch (e) {
            errors.push(`upload_exception:${a.name}: ${String(e)}`)
        }
    }
    return { uploaded, errors }
}

// ─── Per-message handlers ───────────────────────────────────────────────────

interface ProcessContext {
    admin: SupabaseClient
    mailbox: string
    mailboxKind: MailboxKind
    inboxBotUserId: string
    administrationCategoryId: string
}

async function processNewTicket(
    ctx: ProcessContext,
    msg: GraphMessage,
): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
    const subject = (msg.subject ?? '(bez tematu)').trim().slice(0, 500)
    const text = msg.body?.contentType === 'text' ? msg.body.content : null
    const html = msg.body?.contentType === 'html' ? msg.body.content : null
    const bodyMd = (text ?? msg.bodyPreview ?? subject).slice(0, 10000)

    const receivedAt = msg.receivedDateTime
    const dueDate = computeDueDate('P3', new Date(receivedAt))

    const { data: ticket, error: ticketErr } = await ctx.admin
        .from('support_tickets')
        .insert({
            user_id: ctx.inboxBotUserId,
            assignee_id: null,
            category_id: ctx.administrationCategoryId,
            subject,
            body_md: bodyMd,
            priority: 'normal',
            status: 'open',
        })
        .select('id')
        .single()
    if (ticketErr || !ticket) {
        return { ok: false, error: ticketErr?.message ?? 'ticket_insert_failed' }
    }
    const ticketId = (ticket as { id: string }).id

    const { error: metaErr } = await ctx.admin.from('support_inbox_meta').insert({
        ticket_id: ticketId,
        source: 'email',
        external_message_id: msg.internetMessageId,
        external_conversation_id: msg.conversationId,
        priority_level: 'P3',
        due_date: dueDate.toISOString(),
        email_from: msg.from?.emailAddress?.address ?? null,
        email_subject: subject,
        email_received_at: receivedAt,
        email_body_html: html,
        email_body_text: text ?? msg.bodyPreview ?? null,
        email_headers: trimHeaders(msg.internetMessageHeaders),
    })
    if (metaErr) {
        // Compensate — drop the orphan ticket so a future tick can retry cleanly
        await ctx.admin.from('support_tickets').delete().eq('id', ticketId)
        return { ok: false, error: metaErr.message }
    }

    const att = await uploadAttachments(ctx.admin, ticketId, ctx.mailbox, ctx.mailboxKind, msg.id, msg.hasAttachments)

    await writeAudit(ctx.admin, 'INBOX_EMAIL_INGESTED', {
        ticket_id: ticketId,
        mailbox: ctx.mailbox,
        internet_message_id: msg.internetMessageId,
        conversation_id: msg.conversationId,
        from: msg.from?.emailAddress?.address ?? null,
        subject,
        attachments_uploaded: att.uploaded.length,
        attachments_errors: att.errors,
    })

    return { ok: true, ticketId }
}

async function processAppendComment(
    ctx: ProcessContext,
    msg: GraphMessage,
    match: ExistingTicketMatch,
): Promise<{ ok: boolean; reopened: boolean; error?: string }> {
    const body = buildAppendCommentBody(msg)

    const { error: commentErr } = await ctx.admin.from('support_ticket_comments').insert({
        ticket_id: match.ticketId,
        author_id: ctx.inboxBotUserId,
        body_md: body,
        is_internal: false,
    })
    if (commentErr) {
        return { ok: false, reopened: false, error: commentErr.message }
    }

    // Insert a second meta row for the appended message so dedupe works on the
    // next tick. external_conversation_id stays the same; external_message_id
    // is UNIQUE per message.
    const dueDate = computeDueDate('P3', new Date(msg.receivedDateTime))
    await ctx.admin.from('support_inbox_meta').insert({
        ticket_id: match.ticketId,
        source: 'email',
        external_message_id: msg.internetMessageId,
        external_conversation_id: msg.conversationId,
        // Re-using priority/due from original would require a fetch — keep P3 default;
        // SLA banner already comes from the original (first) meta row.
        priority_level: 'P3',
        due_date: dueDate.toISOString(),
        email_from: msg.from?.emailAddress?.address ?? null,
        email_subject: msg.subject ?? null,
        email_received_at: msg.receivedDateTime,
        email_body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
        email_body_text: msg.body?.contentType === 'text' ? msg.body.content : null,
        email_headers: trimHeaders(msg.internetMessageHeaders),
    })

    const att = await uploadAttachments(
        ctx.admin,
        match.ticketId,
        ctx.mailbox,
        ctx.mailboxKind,
        msg.id,
        msg.hasAttachments,
    )

    let reopened = false
    if (match.status === 'resolved' || match.status === 'closed') {
        await ctx.admin
            .from('support_tickets')
            .update({
                status: 'open',
                resolved_at: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', match.ticketId)
        reopened = true

        if (match.assigneeId) {
            try {
                await ctx.admin.from('notifications').insert({
                    user_id: match.assigneeId,
                    type: 'inbox_email_reopened',
                    title_pl: 'Email reotworzył ticket',
                    title_en: 'Email reopened a ticket',
                    body_pl: msg.subject ?? '(bez tematu)',
                    body_en: msg.subject ?? '(no subject)',
                    priority: 'normal',
                })
            } catch (e) {
                logger.warn({ event: 'inbox.reopen_notif_failed', error: String(e) })
            }
        }

        await writeAudit(ctx.admin, 'INBOX_EMAIL_REOPENED', {
            ticket_id: match.ticketId,
            previous_status: match.status,
            internet_message_id: msg.internetMessageId,
            from: msg.from?.emailAddress?.address ?? null,
        })
    } else {
        await ctx.admin
            .from('support_tickets')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', match.ticketId)
    }

    await writeAudit(ctx.admin, 'INBOX_EMAIL_THREAD_APPENDED', {
        ticket_id: match.ticketId,
        internet_message_id: msg.internetMessageId,
        conversation_id: msg.conversationId,
        from: msg.from?.emailAddress?.address ?? null,
        attachments_uploaded: att.uploaded.length,
        attachments_errors: att.errors,
        reopened,
    })

    return { ok: true, reopened }
}

async function processSkip(
    ctx: ProcessContext,
    msg: GraphMessage,
    reason: SkipReason,
    details?: string,
): Promise<void> {
    // Lightweight audit only — no ticket / meta row for skipped messages.
    await writeAudit(ctx.admin, 'INBOX_EMAIL_SKIPPED', {
        mailbox: ctx.mailbox,
        internet_message_id: msg.internetMessageId,
        conversation_id: msg.conversationId,
        from: msg.from?.emailAddress?.address ?? null,
        subject: msg.subject,
        received_at: msg.receivedDateTime,
        reason,
        details,
    })
}

// ─── Top-level orchestrator ─────────────────────────────────────────────────

export async function ingestMailbox(
    deps: IngestDeps,
    mailbox: string = PRIMARY_INBOX_MAILBOX,
): Promise<IngestStats> {
    const start = Date.now()
    const stats: IngestStats = {
        mailbox,
        scanned: 0,
        created: 0,
        appended: 0,
        reopened: 0,
        skipped: 0,
        skippedByReason: {},
        errors: [],
        lastSyncedAt: null,
        durationMs: 0,
    }

    const { admin } = deps

    // 1. Cursor
    const { data: cursorRow } = await admin
        .from('inbox_sync_state')
        .select('last_synced_at, mailbox_kind, group_id')
        .eq('mailbox', mailbox)
        .maybeSingle()

    if (!cursorRow) {
        // Defensive — seeded by migration. If absent, seed it now and bail
        // (next tick will pick up).
        await admin
            .from('inbox_sync_state')
            .insert({ mailbox, last_synced_at: new Date().toISOString() })
        stats.errors.push('cursor_seeded_now_skipping_first_tick')
        stats.durationMs = Date.now() - start
        return stats
    }
    const row = cursorRow as {
        last_synced_at: string
        mailbox_kind?: string | null
        group_id?: string | null
    }
    const since = new Date(row.last_synced_at)

    // Phase 26c — when the mailbox is a M365 Group, surface the group id to the
    // helper via env override (acts as a per-tick hint, falls back to live
    // Graph lookup if missing).
    if (row.mailbox_kind === 'group' && row.group_id) {
        process.env.INBOX_PRIMARY_GROUP_ID = row.group_id
    }

    // 2. Bot user + category (required for INSERTs)
    const [inboxBotUserId, categoryMap] = await Promise.all([
        getInboxBotUserId(admin),
        getInboxCategories(admin),
    ])
    if (!inboxBotUserId) {
        stats.errors.push('no_inbox_bot_user_id_found')
        stats.durationMs = Date.now() - start
        await persistRunResult(admin, mailbox, stats, since, null)
        return stats
    }
    const administrationCategoryId = categoryMap.get('inbox_administracja')
    if (!administrationCategoryId) {
        stats.errors.push('inbox_administracja_category_missing')
        stats.durationMs = Date.now() - start
        await persistRunResult(admin, mailbox, stats, since, null)
        return stats
    }

    const mailboxKind: MailboxKind = row.mailbox_kind === 'group' ? 'group' : 'user'

    const ctx: ProcessContext = {
        admin,
        mailbox,
        mailboxKind,
        inboxBotUserId,
        administrationCategoryId,
    }

    // 3. Graph fetch
    const fetched = await listNewMessages({ mailbox, kind: mailboxKind, since })
    if (!fetched.success) {
        stats.errors.push(`graph_list_failed: ${fetched.error}`)
        stats.durationMs = Date.now() - start
        await persistRunResult(admin, mailbox, stats, since, fetched.error)
        return stats
    }
    if (fetched.skipped) {
        stats.errors.push('graph_credentials_missing')
        stats.durationMs = Date.now() - start
        await persistRunResult(admin, mailbox, stats, since, 'graph_credentials_missing')
        return stats
    }

    stats.scanned = fetched.messages.length

    // 4. Per message
    let maxReceived = since
    const advanceCursor = (receivedIso: string) => {
        const d = new Date(receivedIso)
        if (d > maxReceived) maxReceived = d
    }

    for (const msg of fetched.messages) {
        try {
            if (!msg.internetMessageId) {
                stats.skipped += 1
                stats.skippedByReason.no_internet_message_id =
                    (stats.skippedByReason.no_internet_message_id ?? 0) + 1
                continue
            }

            if (await alreadyIngested(admin, msg.internetMessageId)) {
                stats.skipped += 1
                stats.skippedByReason.duplicate = (stats.skippedByReason.duplicate ?? 0) + 1
                advanceCursor(msg.receivedDateTime)
                continue
            }

            const decision = classifyMessage(msg)
            if (decision.skip) {
                const reason: SkipReason = decision.reason ?? 'no_sender'
                await processSkip(ctx, msg, reason, decision.details)
                stats.skipped += 1
                stats.skippedByReason[reason] = (stats.skippedByReason[reason] ?? 0) + 1
                advanceCursor(msg.receivedDateTime)
                continue
            }

            const match = await findTicketByConversation(admin, msg.conversationId)
            if (match) {
                const res = await processAppendComment(ctx, msg, match)
                if (!res.ok) {
                    stats.errors.push(`append_failed:${msg.internetMessageId}: ${res.error}`)
                } else {
                    stats.appended += 1
                    if (res.reopened) stats.reopened += 1
                }
            } else {
                const res = await processNewTicket(ctx, msg)
                if (!res.ok) {
                    stats.errors.push(`create_failed:${msg.internetMessageId}: ${res.error}`)
                } else {
                    stats.created += 1
                }
            }

            advanceCursor(msg.receivedDateTime)
        } catch (e) {
            const err = e instanceof Error ? e.message : String(e)
            stats.errors.push(`exception:${msg.internetMessageId ?? msg.id}: ${err}`)
            Sentry.captureException(e, {
                tags: { kind: 'inbox_ingest_message' },
                extra: { mailbox, messageId: msg.id },
            })
        }
    }

    // 5. Persist new cursor + run result
    const newLastSynced = maxReceived > since ? maxReceived : since
    stats.lastSyncedAt = newLastSynced.toISOString()
    stats.durationMs = Date.now() - start

    const lastError =
        stats.errors.length > 0
            ? `${stats.errors.length} error(s); first: ${stats.errors[0]}`
            : null
    await persistRunResult(admin, mailbox, stats, newLastSynced, lastError)

    return stats
}

async function persistRunResult(
    admin: SupabaseClient,
    mailbox: string,
    stats: IngestStats,
    newLastSynced: Date,
    lastError: string | null,
): Promise<void> {
    const { error } = await admin
        .from('inbox_sync_state')
        .update({
            last_synced_at: newLastSynced.toISOString(),
            last_run_at: new Date().toISOString(),
            last_error: lastError,
            last_scanned: stats.scanned,
            last_created: stats.created,
            last_appended: stats.appended,
            last_skipped: stats.skipped,
            updated_at: new Date().toISOString(),
        })
        .eq('mailbox', mailbox)
    if (error) {
        logger.error({
            event: 'inbox.sync_state_update_failed',
            mailbox,
            error: error.message,
        })
    }
}
