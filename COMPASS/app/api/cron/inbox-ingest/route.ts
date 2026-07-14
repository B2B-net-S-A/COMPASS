// Phase 26b — Inbox email ingest cron.
//
// Schedule (Coolify): */5 * * * *  (every 5 minutes)
// Auth (required):    Authorization: Bearer $CRON_SECRET
//
// Side-effects per tick:
//   - Reads new messages from administracja@b2bnetwork.pl since cursor
//   - Skips NDR/auto-reply/internal noise
//   - Creates support_tickets or appends to existing via conversationId
//   - Reopens resolved/closed tickets on new email arrival
//   - Uploads attachments to inbox-attachments storage bucket
//   - Updates inbox_sync_state with cursor + stats + error
//
// Response shape (JSON):
//   { ok, mailbox, scanned, created, appended, reopened, skipped, errors[], durationMs }

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { ingestMailbox, PRIMARY_INBOX_MAILBOX } from '@/lib/inbox/ingest'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
// Per-run budget: 4 minutes. Cron tick is 5 minutes; leave 1 minute slack
// so a slow Graph response doesn't overlap with the next tick.
export const maxDuration = 240

export const GET = withCronAuth(async (request, { admin }) => {
    const url = new URL(request.url)
    const mailboxParam = url.searchParams.get('mailbox')
    const mailbox = mailboxParam?.trim() || PRIMARY_INBOX_MAILBOX

    try {
        const stats = await ingestMailbox({ admin }, mailbox)
        if (stats.errors.length > 0) {
            logger.warn({
                event: 'inbox.cron.partial_errors',
                mailbox,
                errorsCount: stats.errors.length,
                firstError: stats.errors[0],
            })
            // Only surface to Sentry if everything failed — partial errors are
            // expected (one bad message shouldn't page).
            if (stats.scanned > 0 && stats.created + stats.appended + stats.skipped === 0) {
                Sentry.captureMessage('inbox_ingest_full_failure', {
                    level: 'error',
                    tags: { kind: 'inbox_ingest_cron' },
                    extra: { mailbox, errors: stats.errors.slice(0, 5) },
                })
            }
        }
        return NextResponse.json({ ok: true, ...stats })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error'
        logger.error({ event: 'inbox.cron.exception', mailbox, error: message })
        Sentry.captureException(err, {
            tags: { kind: 'inbox_ingest_cron' },
            extra: { mailbox },
        })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
})
