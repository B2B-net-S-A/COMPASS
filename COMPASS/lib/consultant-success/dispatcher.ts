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
    /** Zegar do kontroli lease przed wysyłką — wstrzykiwany w testach. */
    clock?: () => number
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
        lostLease: 0,
        durationMs: 0,
    }
}

function safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 1_000)
}

/**
 * ACK dostawy z fencingiem po `claimed_by` (audyt 2026-09-22, INT-20).
 *
 * Lease trwa `leaseSeconds`, a batch jest przetwarzany po kilka sztuk — przy
 * throttlingu dostawcy stary worker potrafi skończyć PO wygaśnięciu lease, gdy
 * inny worker już przejął wiersz (claim nadpisuje `claimed_by`). Bez warunku
 * na `claimed_by` jego ACK nadpisywał stan aktywnej próby nowego workera.
 *
 * Zwraca `false`, gdy wiersz nie należy już do tego workera (0 wierszy) —
 * wołający NIE liczy tego jako sukcesu ani błędu, tylko jako utracony lease.
 */
async function updateDelivery(
    admin: SuccessAdminClient,
    deliveryId: string,
    workerId: string,
    values: Record<string, unknown>,
): Promise<boolean> {
    const { data, error } = await admin
        .from('contractor_success_deliveries')
        .update({
            ...values,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
        .eq('status', 'processing')
        .eq('claimed_by', workerId)
        .select('id')
    if (error) throw new Error(`delivery_ack_failed:${error.message}`)
    if (!Array.isArray(data) || data.length === 0) {
        logger.warn({
            event: 'consultant_success.delivery.lease_lost',
            deliveryId,
            workerId,
            status: values.status,
        })
        return false
    }
    return true
}

/** Lease wygasł (albo nie ma go wcale) — inny worker mógł już przejąć wiersz. */
function leaseExpired(delivery: SuccessDeliveryRow, nowMs: number): boolean {
    if (!delivery.lease_expires_at) return true
    const expiresAt = Date.parse(delivery.lease_expires_at)
    return Number.isNaN(expiresAt) || expiresAt <= nowMs
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

    const clock = options.clock ?? Date.now

    const processOne = async (delivery: SuccessDeliveryRow): Promise<void> => {
        // Każdy ACK idzie przez fencing; utracony lease to osobny licznik,
        // nie sukces i nie błąd — wiersz należy już do innego workera.
        const ack = async (values: Record<string, unknown>): Promise<boolean> => {
            const owned = await updateDelivery(options.admin, delivery.id, options.workerId, values)
            if (!owned) stats.lostLease += 1
            return owned
        }

        try {
            if (isQuietHours(now)) {
                const owned = await ack({
                    status: 'retry',
                    available_at: deferPastQuietHours(now).toISOString(),
                    // Claim increments attempts. Quiet-hour deferral is not a
                    // provider attempt, so return that budget to the row.
                    attempt_count: Math.max(0, delivery.attempt_count - 1),
                    last_error: null,
                })
                if (owned) stats.deferredQuietHours += 1
                return
            }

            // Kontrola lease PRZED efektem zewnętrznym: gdy lease wygasł, inny
            // worker mógł już przejąć wiersz i wysłać — druga wysyłka to duplikat.
            // Nie ACK-ujemy: wiersz wróci do puli przez claim.
            if (leaseExpired(delivery, clock())) {
                stats.lostLease += 1
                logger.warn({
                    event: 'consultant_success.delivery.lease_expired_before_send',
                    deliveryId: delivery.id,
                    workerId: options.workerId,
                })
                return
            }

            let result: DeliveryResult
            try {
                result = await deliverSuccessDelivery(options.admin, delivery, now)
            } catch (error) {
                result = { disposition: 'failed', error: safeError(error) }
            }

            if (result.disposition === 'sent') {
                const owned = await ack({
                    status: 'sent',
                    sent_at: now.toISOString(),
                    last_error: null,
                })
                if (owned) stats.sent += 1
                return
            }
            if (result.disposition === 'skipped_no_subscription') {
                const owned = await ack({
                    status: 'skipped_no_subscription',
                    last_error: null,
                })
                if (owned) stats.skippedNoSubscription += 1
                return
            }
            if (result.disposition === 'cancelled') {
                const owned = await ack({
                    status: 'cancelled',
                    last_error: result.reason,
                })
                if (owned) stats.cancelled += 1
                return
            }

            const decision = retryDecision(delivery.attempt_count, now, delivery.max_attempts)
            const owned = await ack({
                status: decision.status,
                available_at: decision.availableAt ?? delivery.available_at,
                last_error: safeError(result.error),
            })
            if (!owned) return
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
