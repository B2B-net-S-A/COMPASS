import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { bearerSecretMatches } from '@/lib/api/bearer-secret'
import { createServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { scenarioById } from '@/lib/academy/readiness-scenarios'

/**
 * Trasa harnessu E2E Akademii (B0.7). Własny sekret `ACADEMY_READINESS_SECRET`: runner GH nie dostaje
 * service role ani żadnych danych osobowych. Przyjmuje wyłącznie scenario_id, SHA i status, a oddaje
 * stan scenariuszy oraz liczbę wiadomości poza listą skrzynek właściciela, nigdy adresy.
 */
export const dynamic = 'force-dynamic'

const resultSchema = z.object({
    scenario_id: z.string().regex(/^G\d{2}$/),
    sha: z.string().regex(/^[0-9a-f]{7,40}$/),
    status: z.enum(['passed', 'failed', 'stale']),
}).strict()

function authorize(request: NextRequest): NextResponse | null {
    const secret = process.env.ACADEMY_READINESS_SECRET
    if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    if (!bearerSecretMatches(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return null
}

// Tabele B0 nie są jeszcze w wygenerowanych typach bazy.
const serviceClient = () => createServiceClient() as unknown as SupabaseClient
const pending = () => NextResponse.json({ error: 'migration_pending' }, { status: 503 })

export async function POST(request: NextRequest): Promise<Response> {
    const denied = authorize(request)
    if (denied) return denied
    const parsed = resultSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    const { scenario_id, sha, status } = parsed.data
    const scenario = scenarioById(scenario_id)
    if (!scenario) return NextResponse.json({ error: 'Unknown scenario' }, { status: 404 })
    // Wynik ręczny wpisuje człowiek przez SSO; automat może go tylko unieważnić po zmianie plików.
    if (scenario.kind !== 'automat' && status !== 'stale') return NextResponse.json({ error: 'Manual scenario' }, { status: 422 })

    const { error } = await serviceClient().from('academy_readiness_results')
        .insert({ scenario_id, kind: scenario.kind, sha, status })
    if (error) {
        if (isMissingDatabaseObject(error)) return pending()
        logger.error({ event: 'academy.readiness.record_failed', code: error.code })
        return NextResponse.json({ error: 'Write failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest): Promise<Response> {
    const denied = authorize(request)
    if (denied) return denied
    const client = serviceClient()
    const { data, error } = await client.from('academy_readiness_results').select('scenario_id,sha,status').order('run_at', { ascending: false }).limit(2000)
    if (error) {
        if (isMissingDatabaseObject(error)) return pending()
        logger.error({ event: 'academy.readiness.read_failed', code: error.code })
        return NextResponse.json({ error: 'Read failed' }, { status: 500 })
    }
    const latest = new Map<string, { scenario_id: string; sha: string; status: string }>()
    for (const row of (data ?? []) as Array<{ scenario_id: string; sha: string; status: string }>) if (!latest.has(row.scenario_id)) latest.set(row.scenario_id, row)
    return NextResponse.json({ results: Array.from(latest.values()), messages_outside_list: await countOutsideList(client) })
}

/** Null znaczy „nie wiadomo” (brak kolejki albo awaria odczytu), więc asercja harnessu ma paść, a nie przejść. */
async function countOutsideList(client: SupabaseClient): Promise<number | null> {
    const allowed = new Set((process.env.ACADEMY_MAIL_TEST_RECIPIENTS ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean))
    let outside = 0
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from('academy_outbox').select('recipient').in('status', ['sent', 'sent_test']).order('id').range(offset, offset + 499)
        if (error) return null
        const rows = (data ?? []) as Array<{ recipient: string }>
        outside += rows.filter(row => !allowed.has(row.recipient.trim().toLowerCase())).length
        if (rows.length < 500) return outside
    }
}

