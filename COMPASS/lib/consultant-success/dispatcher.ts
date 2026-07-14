import 'server-only'

import { logger } from '@/lib/logger'
import { deliverSuccessDelivery, type DeliveryResult } from './delivery'
import { deferPastQuietHours, isQuietHours, retryDecision } from './scheduling'
import type {
    DispatcherStats,
    SuccessAdminClient,
    SuccessDeliveryRow,
} from './types'

interface DispatcherOptions {
    admin: SuccessAdminClient
    workerId: string
    now?: Date
    limit?: number
    leaseSeconds?: number
    concurrency?: number
}

function baseStats(): DispatcherStats {
    return {
        claimed: 0,
        sent: 0,
        retried: 0,
        dead: 0,
        skippedNoSubscription: 0,
        cancelled: 0,
        deferredQuietHours: 0,
        errors: 0,
        durationMs: 0,
    }
}

function safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 1_000)
}

async function updateDelivery(
    admin: SuccessAdminClient,
    deliveryId: string,
    values: Record<string, unknown>,
): Promise<void> {
    const { error } = await admin
        .from('contractor_success_deliveries')
        .update({
            ...values,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
        .eq('status', 'processing')
    if (error) throw new Error(`delivery_ack_failed:${error.message}`)
}

async function mapWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    let index = 0
    const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
        while (index < items.length) {
            const item = items[index]
            index += 1
            await worker(item)
        }
    })
    await Promise.all(runners)
}

export async function runConsultantSuccessDispatcher(
    options: DispatcherOptions,
): Promise<DispatcherStats> {
    const startedAt = Date.now()
    const now = options.now ?? new Date()
    const stats = baseStats()
    const limit = Math.min(100, Math.max(1, options.limit ?? 50))
    const leaseSeconds = Math.min(900, Math.max(60, options.leaseSeconds ?? 300))

    const { data, error } = await options.admin.rpc('claim_contractor_success_deliveries', {
        p_worker_id: options.workerId,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
    })
    if (error) throw new Error(`delivery_claim_failed:${error.message}`)
    const deliveries = (data ?? []) as SuccessDeliveryRow[]
    stats.claimed = deliveries.length

    const processOne = async (delivery: SuccessDeliveryRow): Promise<void> => {
        try {
            if (isQuietHours(now)) {
                await updateDelivery(options.admin, delivery.id, {
                    status: 'retry',
                    available_at: deferPastQuietHours(now).toISOString(),
                    // Claim increments attempts. Quiet-hour deferral is not a
                    // provider attempt, so return that budget to the row.
                    attempt_count: Math.max(0, delivery.attempt_count - 1),
                    last_error: null,
                })
                stats.deferredQuietHours += 1
                return
            }

            let result: DeliveryResult
            try {
                result = await deliverSuccessDelivery(options.admin, delivery, now)
            } catch (error) {
                result = { disposition: 'failed', error: safeError(error) }
            }

            if (result.disposition === 'sent') {
                await updateDelivery(options.admin, delivery.id, {
                    status: 'sent',
                    sent_at: now.toISOString(),
                    last_error: null,
                })
                stats.sent += 1
                return
            }
            if (result.disposition === 'skipped_no_subscription') {
                await updateDelivery(options.admin, delivery.id, {
                    status: 'skipped_no_subscription',
                    last_error: null,
                })
                stats.skippedNoSubscription += 1
                return
            }
            if (result.disposition === 'cancelled') {
                await updateDelivery(options.admin, delivery.id, {
                    status: 'cancelled',
                    last_error: result.reason,
                })
                stats.cancelled += 1
                return
            }

            const decision = retryDecision(delivery.attempt_count, now, delivery.max_attempts)
            await updateDelivery(options.admin, delivery.id, {
                status: decision.status,
                available_at: decision.availableAt ?? delivery.available_at,
                last_error: safeError(result.error),
            })
            if (decision.status === 'dead') {
                stats.dead += 1
                logger.error({
                    event: 'consultant_success.delivery.dead',
                    deliveryId: delivery.id,
                    deliveryKind: delivery.delivery_kind,
                    channel: delivery.channel,
                    attempts: delivery.attempt_count,
                })
            } else {
                stats.retried += 1
            }
        } catch (error) {
            stats.errors += 1
            logger.error({
                event: 'consultant_success.delivery.processing_failed',
                deliveryId: delivery.id,
                deliveryKind: delivery.delivery_kind,
                channel: delivery.channel,
                error,
            })
        }
    }

    await mapWithConcurrency(deliveries, options.concurrency ?? 5, processOne)
    stats.durationMs = Date.now() - startedAt
    return stats
}

export const _dispatcherInternals = {
    mapWithConcurrency,
    safeError,
}
