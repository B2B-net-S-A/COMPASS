import 'server-only'

import { logger } from '@/lib/logger'
import {
    sendPushToUser,
    type PushSubscriptionRecord,
} from '@/lib/push/web-push-helper'
import { addCalendarDays, localBusinessTimeToUtc, localDate } from './scheduling'
import { sendConsultantSuccessEmail } from './email'
import { areConsultantSuccessSurveysEnabled } from './flags'
import {
    buildPulseSurveyUrl,
    getPulseTokenSecret,
    hashPulseToken,
} from './pulse-token'
import type {
    SuccessAdminClient,
    SuccessDeliveryPayload,
    SuccessDeliveryRow,
} from './types'

export type DeliveryResult =
    | { disposition: 'sent' }
    | { disposition: 'skipped_no_subscription' }
    | { disposition: 'cancelled'; reason: string }
    | { disposition: 'failed'; error: string }

async function validateCurrentDeliveryState(
    admin: SuccessAdminClient,
    delivery: SuccessDeliveryRow,
    now: Date,
): Promise<DeliveryResult | null> {
    if (
        ['pulse_invitation', 'pulse_reminder', 'pulse_low_alert'].includes(delivery.delivery_kind)
        && !areConsultantSuccessSurveysEnabled()
    ) {
        return { disposition: 'cancelled', reason: 'surveys_feature_disabled' }
    }
    if (!delivery.contractor_id) {
        return { disposition: 'cancelled', reason: 'contractor_missing' }
    }

    const [{ data: settings, error: settingsError }, { data: contractor, error: contractorError }] = await Promise.all([
        admin
            .from('contractor_success_settings')
            .select('monitoring_status, health_status, health_review_on')
            .eq('contractor_id', delivery.contractor_id)
            .maybeSingle(),
        admin
            .from('contractors')
            .select('owner_tcm_id, status')
            .eq('id', delivery.contractor_id)
            .maybeSingle(),
    ])
    if (settingsError) {
        return { disposition: 'failed', error: `settings_lookup:${settingsError.message}` }
    }
    if (contractorError) {
        return { disposition: 'failed', error: `contractor_lookup:${contractorError.message}` }
    }
    if (!settings || settings.monitoring_status !== 'active') {
        return { disposition: 'cancelled', reason: 'monitoring_not_active' }
    }
    if (!contractor || contractor.status === 'exited') {
        return { disposition: 'cancelled', reason: 'contractor_not_active' }
    }

    // task_due waliduje odbiorcę względem assignee taska (audyt P1.9) w gałęzi
    // niżej — pozostałe alerty wewnętrzne nadal muszą trafiać do ownera portfolio.
    const isInternalAlert = !['pulse_invitation', 'pulse_reminder'].includes(delivery.delivery_kind)
    if (
        isInternalAlert
        && delivery.delivery_kind !== 'task_due'
        && (!contractor.owner_tcm_id || delivery.recipient_user_id !== contractor.owner_tcm_id)
    ) {
        return { disposition: 'cancelled', reason: 'recipient_owner_changed' }
    }

    const plannedDueOn = typeof delivery.payload?.due_on === 'string'
        ? delivery.payload.due_on.slice(0, 10)
        : null

    if (delivery.delivery_kind === 'check_in_due') {
        const { data, error } = await admin
            .from('contractor_check_ins')
            .select('status, scheduled_for')
            .eq('id', delivery.entity_id)
            .maybeSingle()
        if (error) return { disposition: 'failed', error: `check_in_lookup:${error.message}` }
        if (!data || !['scheduled', 'in_progress'].includes(data.status)) {
            return { disposition: 'cancelled', reason: 'check_in_not_active' }
        }
        if (plannedDueOn && data.scheduled_for !== plannedDueOn) {
            return { disposition: 'cancelled', reason: 'check_in_rescheduled' }
        }
    } else if (delivery.delivery_kind === 'task_due') {
        const { data, error } = await admin
            .from('contractor_tasks')
            .select('status, due_date, snoozed_until, assigned_tcm_id')
            .eq('id', delivery.entity_id)
            .maybeSingle()
        if (error) return { disposition: 'failed', error: `task_lookup:${error.message}` }
        if (!data || !['todo', 'in_progress'].includes(data.status)) {
            return { disposition: 'cancelled', reason: 'task_not_active' }
        }
        // Audyt P1.9: reminder taska należy do assignee (fallback: owner portfolio,
        // gdy taska nikt nie ma przypisanego). Zmiana assignee po zaplanowaniu →
        // anuluj; kolejny run plannera zakolejkuje do właściwej osoby.
        const expectedRecipient = data.assigned_tcm_id ?? contractor.owner_tcm_id
        if (!expectedRecipient || delivery.recipient_user_id !== expectedRecipient) {
            return { disposition: 'cancelled', reason: 'recipient_assignee_changed' }
        }
        if (data.snoozed_until && data.snoozed_until > localDate(now)) {
            return { disposition: 'cancelled', reason: 'task_snoozed' }
        }
        const effectiveDueOn = data.snoozed_until ?? data.due_date
        if (plannedDueOn && effectiveDueOn !== plannedDueOn) {
            return { disposition: 'cancelled', reason: 'task_due_date_changed' }
        }
    } else if (delivery.delivery_kind === 'conversation_follow_up') {
        const { data, error } = await admin
            .from('contractor_conversations')
            .select('resolved_at, follow_up_date')
            .eq('id', delivery.entity_id)
            .maybeSingle()
        if (error) return { disposition: 'failed', error: `conversation_lookup:${error.message}` }
        if (!data || data.resolved_at) {
            return { disposition: 'cancelled', reason: 'conversation_resolved' }
        }
        if (plannedDueOn && data.follow_up_date !== plannedDueOn) {
            return { disposition: 'cancelled', reason: 'conversation_follow_up_changed' }
        }
    } else if (delivery.delivery_kind === 'health_review') {
        if (!['amber', 'red'].includes(settings.health_status) || !settings.health_review_on) {
            return { disposition: 'cancelled', reason: 'health_review_not_due' }
        }
        if (plannedDueOn && settings.health_review_on !== plannedDueOn) {
            return { disposition: 'cancelled', reason: 'health_review_rescheduled' }
        }
    } else if (delivery.delivery_kind === 'pulse_low_alert') {
        const { data, error } = await admin
            .from('contractor_pulse_requests')
            .select('status')
            .eq('id', delivery.entity_id)
            .maybeSingle()
        if (error) return { disposition: 'failed', error: `pulse_request_lookup:${error.message}` }
        if (!data || data.status !== 'completed') {
            return { disposition: 'cancelled', reason: 'pulse_response_not_completed' }
        }
    }

    return null
}

const SUCCESS_HUB_URL = '/internal/people/success'

function cleanText(value: unknown, fallback: string, maxLength = 300): string {
    if (typeof value !== 'string') return fallback
    const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim()
    return (cleaned || fallback).slice(0, maxLength)
}

function safePayload(payload: SuccessDeliveryPayload | null): Required<SuccessDeliveryPayload> {
    const priority = payload?.priority
    return {
        milestone: cleanText(payload?.milestone, 'due', 32),
        title_pl: cleanText(payload?.title_pl, 'Consultant Success — przypomnienie', 120),
        title_en: cleanText(payload?.title_en, 'Consultant Success reminder', 120),
        body_pl: cleanText(payload?.body_pl, 'Masz element wymagający uwagi w Consultant Success Hub.', 300),
        body_en: cleanText(payload?.body_en, 'An item needs your attention in Consultant Success Hub.', 300),
        action_url: typeof payload?.action_url === 'string' && payload.action_url.startsWith('/')
            ? payload.action_url.slice(0, 500)
            : SUCCESS_HUB_URL,
        priority: priority && ['low', 'normal', 'high', 'urgent'].includes(priority)
            ? priority
            : 'normal',
        due_on: cleanText(payload?.due_on, '', 32),
    }
}

function actionUrlWithDeliveryId(actionUrl: string, deliveryId: string): string {
    const separator = actionUrl.includes('?') ? '&' : '?'
    return `${actionUrl}${separator}success_delivery=${encodeURIComponent(deliveryId)}`
}

async function deliverInApp(
    admin: SuccessAdminClient,
    delivery: SuccessDeliveryRow,
): Promise<DeliveryResult> {
    if (!delivery.recipient_user_id) {
        return { disposition: 'failed', error: 'missing_recipient_user_id' }
    }
    const payload = safePayload(delivery.payload)
    const actionUrl = actionUrlWithDeliveryId(payload.action_url, delivery.id)

    // Stable action_url is an application-level idempotency marker. It closes
    // the common crash window after notification INSERT but before outbox ACK.
    const { data: existing, error: lookupError } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', delivery.recipient_user_id)
        .eq('action_url', actionUrl)
        .limit(1)
        .maybeSingle()
    if (lookupError) return { disposition: 'failed', error: `notification_lookup:${lookupError.message}` }
    if (existing?.id) return { disposition: 'sent' }

    const { error } = await admin.from('notifications').insert({
        user_id: delivery.recipient_user_id,
        type: 'contractor_followup',
        title_pl: payload.title_pl,
        title_en: payload.title_en,
        body_pl: payload.body_pl,
        body_en: payload.body_en,
        action_url: actionUrl,
        priority: payload.priority,
    })
    if (error) return { disposition: 'failed', error: `notification_insert:${error.message}` }
    return { disposition: 'sent' }
}

async function deliverPush(
    admin: SuccessAdminClient,
    delivery: SuccessDeliveryRow,
): Promise<DeliveryResult> {
    if (!delivery.recipient_user_id) {
        return { disposition: 'failed', error: 'missing_recipient_user_id' }
    }
    const { data, error } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', delivery.recipient_user_id)
    if (error) return { disposition: 'failed', error: `push_subscription_lookup:${error.message}` }
    const subscriptions = (data ?? []) as PushSubscriptionRecord[]
    if (subscriptions.length === 0) return { disposition: 'skipped_no_subscription' }

    const payload = safePayload(delivery.payload)
    const result = await sendPushToUser(subscriptions, {
        title: payload.title_pl,
        body: payload.body_pl,
        url: payload.action_url,
        tag: `consultant-success-${delivery.delivery_kind}-${delivery.entity_id}`,
    })

    if (result.goneSubIds.length > 0) {
        const { error: cleanupError } = await admin
            .from('push_subscriptions')
            .delete()
            .in('id', result.goneSubIds)
        if (cleanupError) {
            logger.warn({
                event: 'consultant_success.push.cleanup_failed',
                count: result.goneSubIds.length,
                error: cleanupError.message,
            })
        }
    }

    if (result.sent > 0) {
        const goneIds = new Set(result.goneSubIds)
        const liveIds = subscriptions.filter((subscription) => !goneIds.has(subscription.id)).map((subscription) => subscription.id)
        if (liveIds.length > 0) {
            const { error: touchError } = await admin
                .from('push_subscriptions')
                .update({ last_used_at: new Date().toISOString() })
                .in('id', liveIds)
            if (touchError) {
                logger.warn({
                    event: 'consultant_success.push.touch_failed',
                    count: liveIds.length,
                    error: touchError.message,
                })
            }
        }
    }

    // One successful device is enough. Retrying would duplicate the push on
    // that device while trying to recover another stale/browser-blocked one.
    if (result.sent > 0) return { disposition: 'sent' }
    if (result.goneSubIds.length === subscriptions.length) {
        return { disposition: 'skipped_no_subscription' }
    }
    return { disposition: 'failed', error: 'push_delivery_failed' }
}

interface PulseRequestRow {
    id: string
    status: string
    token_hash: string
    expires_at: string
    sent_at: string | null
    reminder_count: number
}

function applicationUrl(): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL
    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not configured')
    return appUrl
}

function absoluteAppUrl(path: string): string {
    return new URL(path, `${applicationUrl().replace(/\/$/, '')}/`).toString()
}

async function deliverPulseEmail(
    admin: SuccessAdminClient,
    delivery: SuccessDeliveryRow,
    now: Date,
): Promise<DeliveryResult> {
    if (!delivery.recipient_email) {
        return { disposition: 'failed', error: 'missing_recipient_email' }
    }
    const { data, error } = await admin
        .from('contractor_pulse_requests')
        .select('id, status, token_hash, expires_at, sent_at, reminder_count')
        .eq('id', delivery.entity_id)
        .maybeSingle()
    if (error) return { disposition: 'failed', error: `pulse_request_lookup:${error.message}` }
    if (!data) return { disposition: 'cancelled', reason: 'pulse_request_missing' }
    const request = data as PulseRequestRow
    if (['completed', 'expired', 'cancelled'].includes(request.status)) {
        return { disposition: 'cancelled', reason: `pulse_request_${request.status}` }
    }
    if (new Date(request.expires_at).getTime() <= now.getTime()) {
        return { disposition: 'cancelled', reason: 'pulse_request_expired' }
    }
    if (delivery.delivery_kind === 'pulse_invitation' && request.status !== 'scheduled') {
        return { disposition: 'cancelled', reason: `pulse_invitation_status_${request.status}` }
    }
    if (delivery.delivery_kind === 'pulse_reminder' && request.status !== 'sent') {
        return { disposition: 'cancelled', reason: `pulse_reminder_status_${request.status}` }
    }

    try {
        const secret = getPulseTokenSecret()
        const surveyUrl = buildPulseSurveyUrl({
            requestId: request.id,
            expiresAt: request.expires_at,
            secret,
            appUrl: applicationUrl(),
        })
        if (hashPulseToken(decodeURIComponent(surveyUrl.split('/').pop() ?? '')) !== request.token_hash) {
            return { disposition: 'failed', error: 'pulse_token_hash_mismatch' }
        }
        const reminder = delivery.delivery_kind === 'pulse_reminder'
        const result = await sendConsultantSuccessEmail({
            to: delivery.recipient_email,
            subject: reminder ? 'Przypomnienie: krótka ankieta współpracy' : 'Krótka ankieta współpracy',
            body: reminder
                ? 'Przypominamy o krótkiej, poufnej ankiecie dotyczącej bieżącej współpracy.'
                : 'Prosimy o wypełnienie krótkiej, poufnej ankiety dotyczącej bieżącej współpracy.',
            actionUrl: surveyUrl,
            actionLabel: 'Wypełnij ankietę',
        })
        if (!result.success) return { disposition: 'failed', error: result.error ?? 'pulse_email_failed' }

        const timestamp = now.toISOString()
        if (!reminder) {
            const nextReminderAt = localBusinessTimeToUtc(
                addCalendarDays(localDate(now), 3),
                8,
            ).toISOString()
            const { error: updateError } = await admin
                .from('contractor_pulse_requests')
                .update({
                    status: 'sent',
                    sent_at: timestamp,
                    next_reminder_at: nextReminderAt,
                })
                .eq('id', request.id)
                .eq('status', 'scheduled')
            if (updateError) return { disposition: 'failed', error: `pulse_mark_sent:${updateError.message}` }
        } else {
            const milestone = safePayload(delivery.payload).milestone
            const sentDate = localDate(new Date(request.sent_at ?? timestamp))
            const nextReminderAt = milestone === 'reminder3'
                ? localBusinessTimeToUtc(addCalendarDays(sentDate, 7), 8).toISOString()
                : null
            const { error: updateError } = await admin
                .from('contractor_pulse_requests')
                .update({
                    reminder_count: request.reminder_count + 1,
                    last_reminder_at: timestamp,
                    next_reminder_at: nextReminderAt,
                })
                .eq('id', request.id)
                .eq('status', 'sent')
            if (updateError) return { disposition: 'failed', error: `pulse_mark_reminded:${updateError.message}` }
        }
        return { disposition: 'sent' }
    } catch (error) {
        return {
            disposition: 'failed',
            error: error instanceof Error ? error.message : 'pulse_email_exception',
        }
    }
}

async function deliverGenericEmail(delivery: SuccessDeliveryRow): Promise<DeliveryResult> {
    if (!delivery.recipient_email) {
        return { disposition: 'failed', error: 'missing_recipient_email' }
    }
    const payload = safePayload(delivery.payload)
    const result = await sendConsultantSuccessEmail({
        to: delivery.recipient_email,
        subject: payload.title_pl,
        body: payload.body_pl,
        actionUrl: absoluteAppUrl(payload.action_url),
        actionLabel: 'Otwórz Consultant Success Hub',
    })
    return result.success
        ? { disposition: 'sent' }
        : { disposition: 'failed', error: result.error ?? 'email_delivery_failed' }
}

export async function deliverSuccessDelivery(
    admin: SuccessAdminClient,
    delivery: SuccessDeliveryRow,
    now = new Date(),
): Promise<DeliveryResult> {
    const staleState = await validateCurrentDeliveryState(admin, delivery, now)
    if (staleState) return staleState

    const isExternalPulseEmail = delivery.channel === 'email'
        && (delivery.delivery_kind === 'pulse_invitation' || delivery.delivery_kind === 'pulse_reminder')
    if (!isExternalPulseEmail) {
        if (!delivery.recipient_user_id) {
            return { disposition: 'failed', error: 'missing_internal_recipient_user_id' }
        }
        const { data: recipient, error } = await admin
            .from('profiles')
            .select('role')
            .eq('id', delivery.recipient_user_id)
            .maybeSingle()
        if (error) return { disposition: 'failed', error: `recipient_role_lookup:${error.message}` }
        if (!recipient || !['talent_community', 'admin'].includes(recipient.role)) {
            return { disposition: 'cancelled', reason: 'recipient_not_tcm_or_admin' }
        }
    }
    if (delivery.channel === 'in_app') return deliverInApp(admin, delivery)
    if (delivery.channel === 'push') return deliverPush(admin, delivery)
    if (delivery.delivery_kind === 'pulse_invitation' || delivery.delivery_kind === 'pulse_reminder') {
        return deliverPulseEmail(admin, delivery, now)
    }
    return deliverGenericEmail(delivery)
}

export const _deliveryInternals = {
    actionUrlWithDeliveryId,
    safePayload,
    validateCurrentDeliveryState,
}
