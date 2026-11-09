import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { CockpitOutboxRow } from './edition-cockpit'
import { isMissingDatabaseObject } from './migration-contract'

const PAGE = 1000
const MAX_PAGES = 20

/** `null` to kolejka nieczytelna albo jeszcze niezmigrowana, a nie pusta. Adresy z klucza zostają tutaj. */
export async function readCockpitOutbox(client: SupabaseClient, runId: string): Promise<CockpitOutboxRow[] | null> {
    const rows: CockpitOutboxRow[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await client.from('academy_outbox').select('kind,status,dedupe_key').eq('run_id', runId).order('id').range(page * PAGE, (page + 1) * PAGE - 1)
        if (error) {
            if (!isMissingDatabaseObject(error)) logger.warn({ event: 'academy.cockpit.outbox_unavailable', code: error.code })
            return null
        }
        rows.push(...(data ?? []) as CockpitOutboxRow[])
        if (!data || data.length < PAGE) return rows
    }
    return rows
}

/** Liczniki puli jako DEKORACJA kokpitu: bez nich reszta osi działa. */
export async function readCockpitQuestions(client: SupabaseClient, versionId: string): Promise<{ approved: number; draft: number } | null> {
    const { data, error } = await client.from('course_quiz_questions').select('pool_status,voided_at').eq('version_id', versionId)
    if (error || !data) {
        if (error && !isMissingDatabaseObject(error)) logger.warn({ event: 'academy.cockpit.questions_unavailable', code: error.code })
        return null
    }
    const live = (data as Array<{ pool_status: string; voided_at: string | null }>).filter(question => !question.voided_at)
    return { approved: live.filter(question => question.pool_status === 'approved').length, draft: live.filter(question => question.pool_status === 'draft').length }
}
