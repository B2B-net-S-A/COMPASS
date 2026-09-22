// Audyt 2026-09-22, INT-07 — sprzątanie Outlooka po anulowanym urlopie.
//
// Helpery Graph są soft-fail: przy błędzie zwracają `{ success: false }` zamiast
// rzucać, więc `.catch` wołającego nigdy nie reagował, a nieudane usunięcie
// eventu/OOF nie zostawiało żadnego śladu. Teraz:
//   1. wołający zapisuje `graph_sync_error = 'cleanup: …'` (recordLeaveCleanupFailure),
//   2. cron `oof-reconcile` ponawia sprzątanie takich wierszy (retryCancelledLeaveCleanup),
//      bo adminowy „ponów" z kolejki obsługuje wyłącznie zatwierdzone urlopy.
//
// Moduł serwerowy bez 'use server' — nie może być endpointem wołanym z przeglądarki.

import 'server-only'

import { deleteLeaveEvent } from '@/lib/calendar/graph-events'
import { disableOutOfOffice } from '@/lib/mailbox/graph-oof'
import { createServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

/** Prefiks `graph_sync_error` wierszy czekających na ponowne sprzątanie. */
export const CLEANUP_ERROR_PREFIX = 'cleanup:'

const MAX_RETRIES_PER_RUN = 50

/**
 * Zapisz nieudane sprzątanie Outlooka na wierszu urlopu. Service-rola, bo
 * anulujący pracownik nie ma prawa pisać kolumn Graph przez RLS. Nigdy nie rzuca —
 * anulowanie urlopu już się odbyło i nie może zostać wywrócone przez zapis śladu.
 */
export async function recordLeaveCleanupFailure(args: {
    leaveId: string
    kind: 'calendar' | 'oof'
    error: string | undefined
}): Promise<void> {
    const message = `${CLEANUP_ERROR_PREFIX} ${args.kind}: ${args.error ?? 'unknown'}`.slice(0, 1_000)
    logger.error({ event: 'leave.cleanup.failed', leave_id: args.leaveId, kind: args.kind, error: args.error })
    try {
        const { error } = await createServiceClient()
            .from('leave_requests')
            .update({ graph_sync_error: message } as never)
            .eq('id', args.leaveId)
        if (error) {
            logger.error({ event: 'leave.cleanup.record_failed', leave_id: args.leaveId, error: error.message })
        }
    } catch (e) {
        logger.error({
            event: 'leave.cleanup.record_failed',
            leave_id: args.leaveId,
            error: e instanceof Error ? e.message : String(e),
        })
    }
}

export interface CleanupRetryStats {
    attempted: number
    cleared: number
    errors: string[]
}

interface CleanupRow {
    id: string
    user_id: string
    start_date: string
    end_date: string
    outlook_event_id: string | null
    graph_oof_set: boolean | null
}

/**
 * Ponów sprzątanie Outlooka dla anulowanych/odrzuconych urlopów oznaczonych
 * `cleanup:`. Event: usuwany (404 = już go nie ma). OOF: wyłączany WYŁĄCZNIE gdy
 * nadal jest dokładnie tym urlopem (INT-03) — cudzego nie ruszamy. Gdy obie
 * rzeczy są czyste, błąd znika z wiersza.
 */
export async function retryCancelledLeaveCleanup(
    admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<CleanupRetryStats> {
    const stats: CleanupRetryStats = { attempted: 0, cleared: 0, errors: [] }
    const { data, error } = await admin
        .from('leave_requests')
        .select('id, user_id, start_date, end_date, outlook_event_id, graph_oof_set')
        .in('status', ['cancelled', 'rejected'])
        .ilike('graph_sync_error', `${CLEANUP_ERROR_PREFIX}%`)
        .limit(MAX_RETRIES_PER_RUN)
    if (error) {
        stats.errors.push(`cleanup: odczyt nieudany (${error.message})`)
        return stats
    }
    const rows = (data ?? []) as CleanupRow[]
    if (rows.length === 0) return stats

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
    const { data: people, error: peopleErr } = await admin.from('profiles').select('id, email').in('id', userIds)
    if (peopleErr) {
        stats.errors.push(`cleanup: odczyt profili nieudany (${peopleErr.message})`)
        return stats
    }
    const emailOf = new Map(
        ((people ?? []) as Array<{ id: string; email: string | null }>).map((p) => [p.id, p.email]),
    )

    for (const row of rows) {
        const email = emailOf.get(row.user_id)
        if (!email) {
            stats.errors.push(`${row.id}: brak e-maila właściciela`)
            continue
        }
        stats.attempted++
        const patch: Record<string, unknown> = {}
        let clean = true

        if (row.outlook_event_id) {
            const r = await deleteLeaveEvent({ userEmail: email, eventId: row.outlook_event_id })
            if (r.success) patch.outlook_event_id = null
            else {
                clean = false
                stats.errors.push(`${row.id}: calendar ${r.error}`)
            }
        }
        if (row.graph_oof_set) {
            const r = await disableOutOfOffice({ userEmail: email, startDate: row.start_date, endDate: row.end_date })
            if (r.success) patch.graph_oof_set = false
            else {
                clean = false
                stats.errors.push(`${row.id}: oof ${r.error}`)
            }
        }
        if (clean) {
            patch.graph_sync_error = null
            stats.cleared++
        }
        if (Object.keys(patch).length > 0) {
            const { error: updErr } = await admin.from('leave_requests').update(patch).eq('id', row.id)
            if (updErr) stats.errors.push(`${row.id}: zapis ${updErr.message}`)
        }
    }
    logger.info({ event: 'leave.cleanup.retry_done', ...stats, errorCount: stats.errors.length })
    return stats
}
