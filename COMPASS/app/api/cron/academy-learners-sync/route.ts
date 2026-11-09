import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { planLearnerSync, type LearnerSyncPlan, type SyncAccount, type SyncContract } from '@/lib/academy/learner-sync'
import { isAcademySwitchOn } from '@/lib/academy/switches'
import { logger } from '@/lib/logger'

/**
 * GET /api/cron/academy-learners-sync
 *
 * B1.6: porównuje aktywne umowy z migawki NEXUS z listą kont nauki. Przy wyłączonym
 * `ACADEMY_LEARNER_SYNC_ENABLED` niczego nie zapisuje i tylko liczy. Odpowiedź, heartbeat
 * i logi niosą same liczby, bez adresów.
 *
 * Ponad 5 wygaszeń czeka na człowieka: ręczne wywołanie `?confirm_expiries=<n>` z dokładną
 * liczbą (ten sam Bearer `CRON_SECRET`).
 *
 * Coolify: zadanie z nazwą kontenera, dodawane pojedynczo. Bez `action=cron-enable`, bo ta
 * akcja włącza wszystkie zadania.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000
const MAX_PAGES = 50

type PageResult = { data: unknown[] | null; error: { code?: string | null } | null }
type PageRead = (from: number, to: number) => PromiseLike<PageResult>

async function readAllRows<T>(read: PageRead): Promise<{ rows: T[]; error: { code?: string | null } | null }> {
    const rows: T[] = []
    for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = page * PAGE_SIZE
        const { data, error } = await read(from, from + PAGE_SIZE - 1)
        if (error) return { rows, error }
        // `null` bez błędu to odpowiedź, która się nie zmaterializowała, nie pusta lista.
        if (data === null) return { rows, error: { code: 'null_response' } }
        rows.push(...(data as T[]))
        if (data.length < PAGE_SIZE) return { rows, error: null }
    }
    return { rows, error: { code: 'too_many_pages' } }
}

async function applyPlan(db: SupabaseClient, plan: LearnerSyncPlan): Promise<{ written: number; failed: number }> {
    const now = new Date().toISOString()
    let written = 0
    let failed = 0
    const record = (error: { code?: string | null } | null, count = 1) => {
        if (error) failed += count
        else written += count
    }
    for (const row of plan.inserts) {
        const { error } = await db.from('academy_learner_accounts').insert(row)
        record(error)
    }
    if (plan.expiredIds.length > 0) {
        const { error } = await db.from('academy_learner_accounts').update({ disappeared_at: now }).in('id', plan.expiredIds)
        record(error, plan.expiredIds.length)
    }
    if (plan.returnedIds.length > 0) {
        const { error } = await db.from('academy_learner_accounts').update({ disappeared_at: null }).in('id', plan.returnedIds)
        record(error, plan.returnedIds.length)
    }
    return { written, failed }
}

function confirmedExpiries(request: NextRequest): number | undefined {
    const raw = request.nextUrl.searchParams.get('confirm_expiries')
    return raw !== null && /^\d{1,6}$/.test(raw) ? Number(raw) : undefined
}

export const GET = withCronAuth(withCronHeartbeat('ACADEMY_LEARNERS_SYNC_RUN', async (request, { admin }) => {
    const db = admin as unknown as SupabaseClient
    const enabled = isAcademySwitchOn('ACADEMY_LEARNER_SYNC_ENABLED')
    try {
        const contracts = await readAllRows<SyncContract>((from, to) => db.from('nexus_contract_snapshot')
            .select('nexus_candidate_id,email,name,lastname').order('nexus_contract_id').range(from, to))
        if (contracts.error) {
            logger.error({ event: 'academy.learners_sync.snapshot_failed', code: contracts.error.code })
            return NextResponse.json({ ok: false, error: 'snapshot_read_failed', written: 0 }, { status: 500 })
        }
        const accounts = await readAllRows<SyncAccount>((from, to) => db.from('academy_learner_accounts')
            .select('id,email,source,source_ref,disappeared_at,ended_at').order('id').range(from, to))
        const migrationPending = isMissingDatabaseObject(accounts.error)
        if (accounts.error && !migrationPending) {
            logger.error({ event: 'academy.learners_sync.accounts_failed', code: accounts.error.code })
            return NextResponse.json({ ok: false, error: 'accounts_read_failed', written: 0 }, { status: 500 })
        }

        const plan = planLearnerSync(contracts.rows, migrationPending ? [] : accounts.rows, { confirmExpiries: confirmedExpiries(request) })
        const canWrite = enabled && !migrationPending && plan.refusal === null
        const { written, failed } = canWrite ? await applyPlan(db, plan) : { written: 0, failed: 0 }
        const ok = failed === 0
        return NextResponse.json({
            ok, enabled, migration_pending: migrationPending, refusal: plan.refusal, counts: plan.counts, written, failed,
        }, { status: ok ? 200 : 500 })
    } catch {
        logger.error({ event: 'academy.learners_sync.failed' })
        return NextResponse.json({ ok: false, error: 'sync_failed', written: 0 }, { status: 500 })
    }
}))
