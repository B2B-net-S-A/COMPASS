import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { holdAcademyMail } from '@/lib/academy/outbound'
import { isAcademySwitchOn } from '@/lib/academy/switches'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { buildRetrievalDueEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BATCH_LIMIT = 200
const MAIL_VALID_MS = 30 * 86_400_000

interface DueRetrieval { schedule_id: string; recipient: string; full_name: string | null; course_title: string; offset_days: number; due_at: string }

/** Za przełącznikiem. Mail powstaje tylko jako wiersz held, a dzwonek rusza dopiero po
 * zapisaniu go w kolejce, więc awaria kolejki nie gubi przypomnienia. */
export const GET = withCronAuth(withCronHeartbeat('ACADEMY_RETRIEVAL_RUN', async (_request, { admin }) => {
    if (!isAcademySwitchOn('ACADEMY_RETRIEVAL_ENABLED')) return NextResponse.json({ ok: true, skipped: 'switch_off', held: 0, notified: 0 })
    const client = admin as unknown as SupabaseClient
    const { data, error } = await client.rpc('academy_retrieval_due', { p_limit: BATCH_LIMIT })
    if (isMissingDatabaseObject(error)) return NextResponse.json({ ok: true, migration_pending: true, held: 0, notified: 0 })
    if (error) {
        logger.error({ event: 'academy.retrieval.read_failed', code: error.code })
        return NextResponse.json({ ok: false, error: 'Nie udało się odczytać terminów powtórek.' }, { status: 500 })
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://compass.dynaminds.pl'
    let held = 0, duplicate = 0, failed = 0, notified = 0
    for (const due of (data ?? []) as DueRetrieval[]) {
        const email = buildRetrievalDueEmail(due.full_name ?? due.recipient, { courseTitle: due.course_title, offsetDays: due.offset_days, scheduleId: due.schedule_id, appUrl })
        const outcome = await holdAcademyMail(client, {
            kind: 'retrieval_due', recipient: due.recipient, ...email,
            expiresAt: new Date(Date.parse(due.due_at) + MAIL_VALID_MS).toISOString(), dedupeKey: `retrieval:${due.schedule_id}`,
        })
        if (outcome.status === 'refused') {
            failed++
            if (outcome.reason === 'migration_pending' || outcome.reason === 'write_failed') break
            continue
        }
        if (outcome.status === 'held') held++
        else duplicate++
        const marked = await client.rpc('academy_retrieval_mark_notified', { p_schedule_id: due.schedule_id })
        if (marked.error) { failed++; logger.error({ event: 'academy.retrieval.notify_failed', code: marked.error.code }); continue }
        notified++
    }
    const ok = failed === 0
    return NextResponse.json({ ok, sent: 0, held, duplicate, notified, failed }, { status: ok ? 200 : 500 })
}))
