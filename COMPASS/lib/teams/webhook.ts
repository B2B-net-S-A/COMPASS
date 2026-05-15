// PR3 — Microsoft Teams incoming webhook.
//
// Posts a MessageCard JSON payload to a Teams channel webhook URL set via
// TEAMS_WEBHOOK_URL env. Used for low-volume operational alerts that
// internal/admin should see without opening Compass — leave/timesheet
// decisions, ticket assignments, pending-timesheet batch reminders.
//
// Why incoming webhook (not Adaptive Cards with bot):
//   - No Azure permission needed; webhook is set up per-channel in Teams UI.
//   - One env var, zero state.
//   - For interactive approvals we'd want a Teams app + bot, but that's
//     PR-tier scope. MessageCard is fine for read-only notifications.
//
// Graceful degradation: missing env → silent skip (logged once at info).
// Never throws — callers are typically fire-and-forget.
//
// Webhook URL format (Office 365 Connector):
//   https://<tenant>.webhook.office.com/webhookb2/<id>@<id>/IncomingWebhook/<id>/<id>

import { logger } from '@/lib/logger'

export interface TeamsAlertMessage {
    /** Card title (bold, top of card). */
    title: string
    /** Card body — plain text or basic HTML (Teams sanitizes most tags). */
    text: string
    /** Hex color WITHOUT `#` — e.g. '00C853' (success), 'D32F2F' (error), 'FFA000' (warning). */
    themeColor?: string
    /** Optional key/value rows shown as a small table under the body. */
    facts?: Array<{ name: string; value: string }>
    /** Optional "Open in Compass" button URL. */
    actionUrl?: string
    /** Action button label. Defaults to "Otwórz w Compass". */
    actionLabel?: string
}

const DEFAULT_THEME_COLOR = '22D3EE' // Compass cyan accent

export interface PostTeamsResult {
    success: boolean
    skipped?: boolean
    error?: string
}

/**
 * Post a MessageCard to the Teams channel webhook.
 *
 * No retry: webhooks are best-effort; Teams accepts and queues. If it fails
 * we just log — the user already got the email notification (which is the
 * source of truth). Adding retry/Sentry here would be noisy for low ROI.
 */
export async function postToTeamsAlert(msg: TeamsAlertMessage): Promise<PostTeamsResult> {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL?.trim()
    if (!webhookUrl) {
        // First call per process logs once; subsequent calls silent to avoid log spam.
        if (!warnedAboutMissingUrl) {
            logger.info({
                event: 'teams.webhook.skip_no_url',
                msg: 'TEAMS_WEBHOOK_URL not configured — Teams alerts disabled (email still works).',
            })
            warnedAboutMissingUrl = true
        }
        return { success: true, skipped: true }
    }

    const card: Record<string, unknown> = {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        themeColor: msg.themeColor ?? DEFAULT_THEME_COLOR,
        summary: msg.title, // shown in Teams notification popup
        sections: [
            {
                activityTitle: `**${msg.title}**`,
                text: msg.text,
                ...(msg.facts && msg.facts.length > 0 ? { facts: msg.facts } : {}),
            },
        ],
        ...(msg.actionUrl
            ? {
                  potentialAction: [
                      {
                          '@type': 'OpenUri',
                          name: msg.actionLabel ?? 'Otwórz w Compass',
                          targets: [{ os: 'default', uri: msg.actionUrl }],
                      },
                  ],
              }
            : {}),
    }

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card),
            // Teams webhooks normally respond in <200ms; give ourselves a
            // hard cap so we don't pile up if the connector is down.
            signal: AbortSignal.timeout(5000),
        })

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            logger.warn({
                event: 'teams.webhook.failed',
                status: res.status,
                title: msg.title,
                body: body.slice(0, 200),
            })
            return { success: false, error: `${res.status}: ${body.slice(0, 100)}` }
        }
        return { success: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error'
        logger.warn({
            event: 'teams.webhook.error',
            error: message,
            title: msg.title,
        })
        return { success: false, error: message }
    }
}

let warnedAboutMissingUrl = false
