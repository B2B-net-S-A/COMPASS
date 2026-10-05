// Phase 41 — Outlook inbox rules that forward mail to a substitute during leave.
//
// Phase 25 already tells senders who the substitute is (via the OOF auto-reply),
// but the mail itself still sits unread in the absent employee's mailbox. Here we
// create a real forwarding rule for the duration of the leave, then remove it.
//
// `forwardTo` (not `redirectTo`) is deliberate: the substitute gets a copy while the
// original stays with the owner, so they come back to a complete mailbox.
//
// IMPORTANT — inbox rules do NOT expire. `messageRulePredicates` has no date or
// schedule field, so a rule lives until something deletes it. Everything here is
// built around that: the rule id is persisted on the leave row for a targeted
// delete, AND the display name embeds the leave id so an orphan sweep can find
// rules whose id we lost. Never create a rule without persisting what comes back.
//
// Requires Application permission `MailboxSettings.ReadWrite` — the same one Phase 25
// already uses to PATCH mailboxSettings, so no extra Azure consent is involved
// (POST/DELETE .../mailFolders/inbox/messageRules list it as least-privileged, with
// no higher-privileged alternative).
//
// Soft-fail: every helper returns `{success: false, error}` rather than throwing.
// Approving a leave must never break because Graph is having a bad day — the admin
// sees `graph_sync_error` in the queue and can retry.

import * as Sentry from '@sentry/nextjs'
import {
    extractGraphErrorInfo,
    getGraphClient,
    isRetryableGraphStatus,
} from '@/lib/graph/client'
import { isNoExchangeMailboxError } from '@/lib/graph/no-mailbox'
import { logger } from '@/lib/logger'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000

/**
 * Marks a rule as Compass-managed. The leave id is appended so the orphan sweep can
 * decide whether a rule still has a live leave behind it without a lookup table.
 * Users see this name in Outlook, so it stays human-readable.
 */
export const COMPASS_FORWARD_RULE_PREFIX = 'COMPASS · zastępstwo · '

/** Colleagues see the leave and the OOF reply naming the substitute — no copy needed. */
const COMPANY_MAIL_DOMAIN = '@b2bnetwork.pl'

/**
 * Sender fragments that never need a human substitute: colleagues, noreply senders and
 * Microsoft 365 notifications (Teams, SharePoint, Planner). 2026-09-25: a forward-all
 * rule was copying Teams "you have new messages" mail to substitutes.
 */
const EXCLUDED_SENDER_FRAGMENTS = [
    COMPANY_MAIL_DOMAIN,
    'no-reply',
    'noreply',
    'donotreply',
    'do-not-reply',
    'teams.mail.microsoft',
    'sharepointonline.com',
    'microsoft.com',
    'mailer-daemon',
    'postmaster',
]

/**
 * What a forwarding rule matches: mail from outside the company, addressed to the owner
 * directly (not via a group list or BCC), minus bulk mail and calendar traffic.
 * Shared by create and update, so a live rule can be brought in line with new filters.
 *
 * The automatic-reply/forward exceptions also break mail loops — without them two
 * people on leave who substitute for each other would bounce messages back and forth.
 *
 * Pure function — exported for unit testing.
 */
export function buildForwardRuleFilters() {
    return {
        conditions: {
            sentToOrCcMe: true,
        },
        exceptions: {
            senderContains: [...EXCLUDED_SENDER_FRAGMENTS],
            headerContains: ['List-Unsubscribe'],
            isAutomaticReply: true,
            isAutomaticForward: true,
            isMeetingRequest: true,
            isMeetingResponse: true,
            isReadReceipt: true,
            isNonDeliveryReport: true,
        },
    }
}

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

/** Display name Compass writes for a leave's forwarding rule. */
export function buildForwardRuleName(leaveId: string): string {
    return `${COMPASS_FORWARD_RULE_PREFIX}${leaveId}`
}

/**
 * Inverse of buildForwardRuleName. Returns null for anything that is not a
 * Compass-managed rule — including a user's own rule that happens to start with a
 * similar prefix but carries no UUID.
 *
 * Pure function — exported for unit testing.
 */
export function parseLeaveIdFromRuleName(displayName: string | null | undefined): string | null {
    if (typeof displayName !== 'string') return null
    if (!displayName.startsWith(COMPASS_FORWARD_RULE_PREFIX)) return null
    const candidate = displayName.slice(COMPASS_FORWARD_RULE_PREFIX.length).trim()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    return isUuid ? candidate.toLowerCase() : null
}

export type ForwardRuleSkipReason =
    /** Azure/Graph credentials not configured (dev/local). */
    | 'no_credentials'

export interface ForwardRuleResult {
    success: boolean
    /** Graph messageRule id — persist to leave_requests.outlook_forward_rule_id. */
    ruleId?: string
    error?: string
    /** True when we skipped rather than failed (e.g. no credentials locally). */
    skipped?: boolean
    skipReason?: ForwardRuleSkipReason
}

export interface CompassForwardRule {
    id: string
    displayName: string
    /** Leave id parsed out of the display name. */
    leaveId: string
}

export interface CreateForwardRuleInput {
    /** Mailbox owner — must be a real user in the tenant (UPN/email). */
    userEmail: string
    /** Where mail should be copied to. */
    substituteEmail: string
    substituteName?: string | null
    /** leave_requests.id — embedded in the rule name for orphan detection. */
    leaveId: string
}

/**
 * Create the forwarding rule in the employee's inbox. What it matches comes from
 * buildForwardRuleFilters.
 *
 * `stopProcessingRules: false` is load-bearing: the employee's own rules (filing into
 * folders, flagging, etc.) must keep running after ours. `sequence: 1` puts us first
 * so a user rule that *does* stop processing cannot suppress the forward.
 */
export async function createForwardRule(
    input: CreateForwardRuleInput,
): Promise<ForwardRuleResult> {
    if (!credsConfigured()) {
        logger.info({
            event: 'forward_rule.graph.skip_no_credentials',
            userEmail: input.userEmail,
        })
        return { success: true, skipped: true, skipReason: 'no_credentials' }
    }

    const body = {
        displayName: buildForwardRuleName(input.leaveId),
        sequence: 1,
        isEnabled: true,
        actions: {
            forwardTo: [
                {
                    emailAddress: {
                        name: input.substituteName ?? input.substituteEmail,
                        address: input.substituteEmail,
                    },
                },
            ],
            stopProcessingRules: false,
        },
        ...buildForwardRuleFilters(),
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
            const created = (await client
                .api(
                    `/users/${encodeURIComponent(input.userEmail)}/mailFolders/inbox/messageRules`,
                )
                .post(body)) as { id?: string } | null

            const ruleId = created?.id
            if (!ruleId) {
                // Rule may well exist in the mailbox but we cannot address it for
                // deletion. Report failure so the orphan sweep is the one to clean up.
                logger.error({
                    event: 'forward_rule.graph.create_no_id',
                    userEmail: input.userEmail,
                    leaveId: input.leaveId,
                })
                return { success: false, error: 'graph_returned_no_rule_id' }
            }
            return { success: true, ruleId }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'forward_rule.graph.retry',
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
        event: 'forward_rule.graph.create_failed',
        error: message,
        userEmail: input.userEmail,
        leaveId: input.leaveId,
    })
    Sentry.captureMessage('forward_rule_create_failed', {
        level: 'warning',
        tags: { kind: 'graph_forward_rule_create' },
        extra: { userEmail: input.userEmail, leaveId: input.leaveId, error: message },
    })
    return { success: false, error: message }
}

export interface DeleteForwardRuleInput {
    userEmail: string
    ruleId: string
}

/**
 * Remove a forwarding rule. Idempotent: a 404 counts as success, since the employee
 * may well have deleted the rule themselves in Outlook (same contract as
 * deleteLeaveEvent). Anything left behind is caught by the orphan sweep.
 */
export async function deleteForwardRule(
    input: DeleteForwardRuleInput,
): Promise<ForwardRuleResult> {
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

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await client
                .api(
                    `/users/${encodeURIComponent(input.userEmail)}/mailFolders/inbox/messageRules/${encodeURIComponent(input.ruleId)}`,
                )
                .delete()
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            // Rule already gone — nothing to clean up.
            if (statusCode === 404) {
                logger.info({
                    event: 'forward_rule.graph.delete_already_gone',
                    userEmail: input.userEmail,
                })
                return { success: true }
            }

            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'forward_rule.graph.delete_failed',
        error: message,
        userEmail: input.userEmail,
        ruleId: input.ruleId,
    })
    // Louder than a create failure: a rule we cannot delete keeps forwarding somebody's
    // mail indefinitely.
    Sentry.captureMessage('forward_rule_delete_failed', {
        level: 'warning',
        tags: { kind: 'graph_forward_rule_delete' },
        extra: { userEmail: input.userEmail, ruleId: input.ruleId, error: message },
    })
    return { success: false, error: message }
}

export interface UpdateForwardRuleFiltersInput {
    userEmail: string
    ruleId: string
}

/**
 * Re-apply buildForwardRuleFilters to a live rule. Only conditions and exceptions are
 * sent: the display name is the orphan sweep's anchor and the forward target belongs
 * to the leave, so neither is touched.
 *
 * Unlike delete, a 404 is a failure here — the rule we meant to fix is gone. The next
 * reconcile run notices that on its own.
 */
export async function updateForwardRuleFilters(
    input: UpdateForwardRuleFiltersInput,
): Promise<ForwardRuleResult> {
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

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await client
                .api(
                    `/users/${encodeURIComponent(input.userEmail)}/mailFolders/inbox/messageRules/${encodeURIComponent(input.ruleId)}`,
                )
                .patch(buildForwardRuleFilters())
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            if (statusCode === 404) {
                logger.warn({
                    event: 'forward_rule.graph.update_not_found',
                    userEmail: input.userEmail,
                    ruleId: input.ruleId,
                })
                return { success: false, error: 'rule_not_found' }
            }

            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'forward_rule.graph.update_failed',
        error: message,
        userEmail: input.userEmail,
        ruleId: input.ruleId,
    })
    Sentry.captureMessage('forward_rule_update_failed', {
        level: 'warning',
        tags: { kind: 'graph_forward_rule_update' },
        extra: { userEmail: input.userEmail, ruleId: input.ruleId, error: message },
    })
    return { success: false, error: message }
}

/**
 * List the Compass-managed forwarding rules in a mailbox. Returns null on any failure
 * (network, 403, 404) — callers must treat null as "unknown" and skip the sweep for
 * that mailbox rather than concluding there is nothing to clean up. The one exception
 * is an account with no Exchange mailbox at all: that returns [] (see no-mailbox.ts).
 *
 * No retry, matching getCurrentOof: this runs across every HR mailbox in one cron
 * pass, and retry storms there are worse than a mailbox skipped until tomorrow.
 */
export async function listCompassForwardRules(
    userEmail: string,
): Promise<CompassForwardRule[] | null> {
    if (!credsConfigured()) return null

    let client
    try {
        client = await getGraphClient()
    } catch {
        return null
    }

    try {
        const res = (await client
            .api(`/users/${encodeURIComponent(userEmail)}/mailFolders/inbox/messageRules`)
            .get()) as { value?: unknown } | null

        const raw = Array.isArray(res?.value) ? res.value : []
        const rules: CompassForwardRule[] = []
        for (const item of raw) {
            if (typeof item !== 'object' || item === null) continue
            const { id, displayName } = item as { id?: unknown; displayName?: unknown }
            if (typeof id !== 'string' || typeof displayName !== 'string') continue
            const leaveId = parseLeaveIdFromRuleName(displayName)
            if (!leaveId) continue
            rules.push({ id, displayName, leaveId })
        }
        return rules
    } catch (err) {
        // No Exchange mailbox → nowhere a Compass rule could live. Known, not unknown.
        if (isNoExchangeMailboxError(err)) {
            logger.info({ event: 'forward_rule.graph.list_no_mailbox', userEmail })
            return []
        }
        const { statusCode } = extractGraphErrorInfo(err)
        logger.warn({
            event: 'forward_rule.graph.list_failed',
            statusCode,
            userEmail,
            error: err instanceof Error ? err.message : String(err),
        })
        return null
    }
}
