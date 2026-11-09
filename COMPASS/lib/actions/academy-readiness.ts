'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { academySwitchStates } from '@/lib/academy/switches'
import { buildScenarioStates, type LaunchCondition, type ReadinessOverview, type ReadinessResultRow } from '@/lib/academy/readiness'
import { scenarioById } from '@/lib/academy/readiness-scenarios'
import type { ActionResult } from '@/lib/types/learning'

const RESULT_COLUMNS = 'scenario_id,kind,sha,status,evidence_path,note,run_at,valid_until'
const PATH = '/admin/learning/gotowosc'

/** Licznik kolejki jest dekoracją: brak tabeli albo awaria nie zamienia panelu w ekran błędu. */
async function outboxCount(client: SupabaseClient, status: string): Promise<number | null> {
    const { count, error } = await client.from('academy_outbox').select('id', { count: 'exact', head: true }).eq('status', status)
    return error ? null : count ?? 0
}

export async function getAcademyReadiness(): Promise<ActionResult<ReadinessOverview>> {
    return academyAction('readiness.overview', async () => {
        const { client, access } = await requireAcademyContext({ admin: true })
        const [results, conditions, held, expired, sentTest] = await Promise.all([
            client.from('academy_readiness_results').select(RESULT_COLUMNS).order('run_at', { ascending: false }).limit(2000),
            client.from('academy_launch_conditions').select('item,owner,status,evidence,decided_at').order('item'),
            outboxCount(client, 'held'), outboxCount(client, 'expired'), outboxCount(client, 'sent_test'),
        ])
        const migrationPending = isMissingDatabaseObject(results.error) || isMissingDatabaseObject(conditions.error)
        if (!migrationPending) {
            assertDatabaseResult(results.error)
            assertDatabaseResult(conditions.error)
        }
        return {
            migrationPending,
            rolloutMode: access.rolloutMode ?? null,
            scenarios: buildScenarioStates(migrationPending ? [] : (results.data ?? []) as ReadinessResultRow[], new Date()),
            conditions: migrationPending ? [] : (conditions.data ?? []) as LaunchCondition[],
            switches: [...academySwitchStates(process.env)],
            outbox: held === null || expired === null || sentTest === null ? null : { held, expired, sentTest },
            currentSha: (process.env.GIT_SHA ?? '').slice(0, 12),
        }
    })
}

export async function getReadinessEvidenceUrl(path: string): Promise<ActionResult<string>> {
    return academyAction('readiness.evidence', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const parsed = z.string().regex(/^G\d{2}\/[0-9a-f-]{36}\.(png|jpg|pdf)$/).parse(path)
        const { data, error } = await client.storage.from('academy-readiness-evidence').createSignedUrl(parsed, 120)
        if (error || !data?.signedUrl) throw new Error('Nie udało się otworzyć zrzutu. Odśwież stronę i spróbuj ponownie.')
        return data.signedUrl
    })
}

const manualSchema = z.object({
    scenarioId: z.string().regex(/^G\d{2}$/), sha: z.string().trim().regex(/^[0-9a-f]{7,40}$/),
    status: z.enum(['passed', 'failed']), evidencePath: z.string().regex(/^G\d{2}\/[0-9a-f-]{36}\.(png|jpg|pdf)$/).nullable(),
    note: z.string().trim().max(2000).nullable(),
})

export async function recordReadinessResult(input: z.input<typeof manualSchema>): Promise<ActionResult<void>> {
    return academyAction('readiness.record', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const parsed = manualSchema.parse(input)
        const scenario = scenarioById(parsed.scenarioId)
        if (!scenario) throw new Error('Nie ma takiego scenariusza gotowości.')
        if (scenario.kind !== 'ręczny') throw new Error('Wynik tego scenariusza zapisuje automat, nie człowiek.')
        if (parsed.status === 'passed' && !parsed.evidencePath) throw new Error('Dołącz zrzut ekranu potwierdzający wynik.')
        if (parsed.evidencePath && !parsed.evidencePath.startsWith(`${parsed.scenarioId}/`)) throw new Error('Zrzut nie należy do tego scenariusza.')
        const { error } = await client.rpc('academy_record_readiness_result', { p_scenario_id: parsed.scenarioId, p_sha: parsed.sha, p_status: parsed.status, p_evidence_path: parsed.evidencePath, p_note: parsed.note })
        assertDatabaseResult(error)
        revalidatePath(PATH)
    })
}

export async function updateLaunchCondition(input: { item: string; status: string; evidence: string | null }): Promise<ActionResult<void>> {
    return academyAction('readiness.condition', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const parsed = z.object({ item: z.string().min(1).max(200), status: z.enum(['not_started', 'in_progress', 'ready']), evidence: z.string().trim().max(2000).nullable() }).parse(input)
        if (parsed.status === 'ready' && (parsed.evidence ?? '').length < 3) throw new Error('Podaj dowód spełnienia warunku.')
        const { error } = await client.rpc('academy_update_launch_condition', { p_item: parsed.item, p_status: parsed.status, p_evidence: parsed.evidence })
        assertDatabaseResult(error)
        revalidatePath(PATH)
    })
}
