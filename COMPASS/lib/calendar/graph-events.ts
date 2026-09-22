// PR2 — Graph Calendar API write helpers.
//
// When a leave request is approved we want the consultant to see the event
// in their Outlook calendar without subscribing to our ICS feed (the feed
// refreshes hourly at best, and Outlook sometimes never refreshes external
// calendars). Pushing the event directly via Graph means it shows up in
// seconds, blocks the timeslot as "out of office", and gets the standard
// reminder/notification behavior the user already configured.
//
// Requires Application permission `Calendars.ReadWrite` granted to the
// Compass Azure App (admin consent). Same secret as Mail.Send.
//
// Idempotency: `transactionId` lets us safely retry without creating
// duplicates — Graph rejects the second POST with the same id. We use
// `leave-{request_id}` so the mapping is deterministic.

import * as Sentry from '@sentry/nextjs'
import { HR_LEAVE_TYPE_LABEL } from '@/lib/email'
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

export interface CreateLeaveEventInput {
    /** Mailbox owner — must be a real user in the tenant. */
    userEmail: string
    /** ISO date (YYYY-MM-DD), inclusive. */
    startDate: string
    /** ISO date (YYYY-MM-DD), inclusive. */
    endDate: string
    /** DB leave_type enum value. */
    leaveType: string
    /** Optional admin decision note — surfaced in event body. */
    note?: string | null
    /** Deterministic id (e.g. `leave-${leaveRequestId}`) for idempotent retry. */
    transactionId: string
}

export interface CreateLeaveEventResult {
    success: boolean
    /** Graph event id, persist to leave_requests.outlook_event_id for later delete. */
    eventId?: string
    error?: string
    /** True when we skipped (e.g. credentials missing) — distinct from a real failure. */
    skipped?: boolean
}

/**
 * Push an all-day event to the user's Outlook calendar.
 *
 * Returns success even when AZURE_* env vars are missing — Calendar is a
 * nice-to-have and must never block the core approve flow.
 */
export async function createLeaveEvent(
    input: CreateLeaveEventInput,
): Promise<CreateLeaveEventResult> {
    if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
        logger.info({
            event: 'calendar.graph.skip_no_credentials',
            transactionId: input.transactionId,
        })
        return { success: true, skipped: true }
    }

    const typeLabel = HR_LEAVE_TYPE_LABEL[input.leaveType] ?? input.leaveType

    // Graph all-day events: start/end are at midnight in the timezone, and
    // end is the day *after* the last actual day (exclusive). DB stores
    // both as inclusive YYYY-MM-DD, so we add 1 day to endDate.
    const endExclusive = addDays(input.endDate, 1)

    const body = {
        subject: `[Compass] ${typeLabel}`,
        isAllDay: true,
        start: { dateTime: `${input.startDate}T00:00:00`, timeZone: TIMEZONE },
        end: { dateTime: `${endExclusive}T00:00:00`, timeZone: TIMEZONE },
        showAs: 'oof' as const,
        categories: ['Compass'],
        body: {
            contentType: 'text' as const,
            content: input.note ?? '',
        },
        transactionId: input.transactionId,
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
            const result = (await client
                .api(`/users/${encodeURIComponent(input.userEmail)}/events`)
                .post(body)) as { id?: string }
            return { success: true, eventId: result.id }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            // 409 from transactionId conflict → event already exists from a prior
            // successful attempt. Treat as success but without an id (caller
            // already has it from the original POST).
            if (statusCode === 409) {
                logger.info({
                    event: 'calendar.graph.transaction_id_conflict',
                    transactionId: input.transactionId,
                })
                return { success: true, eventId: undefined }
            }

            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS

            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'calendar.graph.retry',
                attempt,
                statusCode,
                backoffMs: backoff,
                transactionId: input.transactionId,
            })
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'calendar.graph.create_failed',
        error: message,
        transactionId: input.transactionId,
    })
    Sentry.captureMessage('calendar_event_create_failed', {
        level: 'warning',
        tags: { kind: 'graph_calendar_create' },
        extra: { transactionId: input.transactionId, error: message },
    })
    return { success: false, error: message }
}

export interface DeleteLeaveEventInput {
    userEmail: string
    eventId: string
}

export interface DeleteLeaveEventResult {
    success: boolean
    error?: string
    skipped?: boolean
}

/**
 * Remove an event from the user's Outlook calendar (after leave is rejected
 * or cancelled). Skipped when credentials are missing or eventId is empty.
 *
 * 404 is treated as success (event already gone — common if the user
 * deleted it from Outlook manually).
 */
export async function deleteLeaveEvent(
    input: DeleteLeaveEventInput,
): Promise<DeleteLeaveEventResult> {
    if (!input.eventId) {
        return { success: true, skipped: true }
    }
    if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
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

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await client
                .api(`/users/${encodeURIComponent(input.userEmail)}/events/${input.eventId}`)
                .delete()
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            if (statusCode === 404) {
                logger.info({
                    event: 'calendar.graph.delete_already_gone',
                    eventId: input.eventId,
                })
                return { success: true }
            }

            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS

            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'calendar.graph.delete_retry',
                attempt,
                statusCode,
                backoffMs: backoff,
                eventId: input.eventId,
            })
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'calendar.graph.delete_failed',
        error: message,
        eventId: input.eventId,
    })
    Sentry.captureMessage('calendar_event_delete_failed', {
        level: 'warning',
        tags: { kind: 'graph_calendar_delete' },
        extra: { eventId: input.eventId, error: message },
    })
    return { success: false, error: message }
}

function addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export interface UpdateLeaveEventInput {
    userEmail: string
    eventId: string
    /** ISO date (YYYY-MM-DD), inclusive. */
    startDate: string
    /** ISO date (YYYY-MM-DD), inclusive. */
    endDate: string
    /** DB leave_type enum value — the subject follows a type change. */
    leaveType: string
}

export interface UpdateLeaveEventResult {
    success: boolean
    error?: string
    skipped?: boolean
    /** Graph answered 404 — the event is gone (e.g. deleted by the user in Outlook). */
    notFound?: boolean
}

/**
 * Audyt 2026-09-22 (HF-07) — move an existing leave event after the leave's dates
 * (or type) were edited. Same all-day shape as {@link createLeaveEvent}; PATCH keeps
 * the event id stable, so the id persisted in `leave_requests.outlook_event_id` stays
 * valid for a later delete.
 */
export async function updateLeaveEvent(
    input: UpdateLeaveEventInput,
): Promise<UpdateLeaveEventResult> {
    if (!input.eventId) {
        return { success: true, skipped: true }
    }
    if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
        return { success: true, skipped: true }
    }

    const typeLabel = HR_LEAVE_TYPE_LABEL[input.leaveType] ?? input.leaveType
    const body = {
        subject: `[Compass] ${typeLabel}`,
        isAllDay: true,
        start: { dateTime: `${input.startDate}T00:00:00`, timeZone: TIMEZONE },
        end: { dateTime: `${addDays(input.endDate, 1)}T00:00:00`, timeZone: TIMEZONE },
        showAs: 'oof' as const,
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
                .api(`/users/${encodeURIComponent(input.userEmail)}/events/${input.eventId}`)
                .patch(body)
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            if (statusCode === 404) {
                logger.info({
                    event: 'calendar.graph.update_not_found',
                    eventId: input.eventId,
                })
                return { success: false, notFound: true, error: 'event_not_found' }
            }

            const retryable = isRetryableGraphStatus(statusCode)
            if (!retryable || attempt >= MAX_ATTEMPTS) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'calendar.graph.update_retry',
                attempt,
                statusCode,
                backoffMs: backoff,
                eventId: input.eventId,
            })
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'calendar.graph.update_failed',
        error: message,
        eventId: input.eventId,
    })
    Sentry.captureMessage('calendar_event_update_failed', {
        level: 'warning',
        tags: { kind: 'graph_calendar_update' },
        extra: { eventId: input.eventId, error: message },
    })
    return { success: false, error: message }
}
