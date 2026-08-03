// Phase 46 (Etap 2) — materializacja rotacji bloków na bieżący kwartał.
// Plain module (NIE 'use server') — wspólny dla crona `tech-map-rotation`
// i przycisku „Przelicz przydziały" w panelu admina (wzorzec bench-seed.ts).
//
// Dlaczego osobny przebieg, skoro zapis karty i tak materializuje przydział:
// żeby TCM widział przydzielony blok ZANIM ktokolwiek zacznie rozmowę —
// bez tego pierwsza karta w kwartale ustalałaby blok po fakcie.
//
// Render NIE wywołuje tej funkcji (audyt 2026-07-16 P1.8 — zero side-effectów
// w renderze). Heartbeat w audit_logs jest jedynym czytelnym z bazy dowodem,
// że cron faktycznie się wykonał (odpowiedź HTTP jest za CRON_SECRET).

import { logAudit } from '@/lib/actions/audit'
import { logger } from '@/lib/logger'
import { warsawDate } from '@/lib/oof/oof-dates'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    computeRotationInserts,
    periodFromDate,
    type AssignmentLike,
    type RotationCandidate,
} from './block-rotation'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Populacja rotacji — kontraktorzy realnie pracujący u klienta. */
const ROTATION_STATUSES = ['active'] as const

export interface RotationSweepStats {
    period: string
    /** Kontraktorzy w populacji (status active). */
    population: number
    /** Wstawione przydziały (kontraktorzy, którzy jeszcze nie mieli tego kwartału). */
    assigned: number
    /** Pominięci, bo mają już przydział (auto albo ręczny — ręczny jest lepki). */
    skipped: number
    errors: string[]
}

/**
 * Nadaje brakujące przydziały bloków na kwartał zawierający `now`.
 * Idempotentne: `ignoreDuplicates` + pomijanie kontraktorów z przydziałem,
 * więc kolejne uruchomienia tego samego dnia nic nie zmieniają.
 *
 * `actorUserId` trafia do audytu; cron przekazuje null (aktor systemowy).
 */
export async function sweepBlockAssignments(
    admin: ServiceClient,
    opts: { now?: Date; actorUserId?: string | null } = {},
): Promise<RotationSweepStats> {
    const now = opts.now ?? new Date()
    const actorUserId = opts.actorUserId ?? null
    const todayISO = warsawDate(now)
    const { year, quarter } = periodFromDate(todayISO)
    const period = `${year}-Q${quarter}`
    const errors: string[] = []

    await logAudit(actorUserId, 'TECH_MAP_ROTATION_RUN', { phase: 'start', period, at: todayISO })

    const { data: contractorRows, error: contractorError } = await admin
        .from('contractors')
        .select('id')
        .in('status', ROTATION_STATUSES as unknown as string[])

    if (contractorError) {
        errors.push(`contractors: ${contractorError.message}`)
        await logAudit(actorUserId, 'TECH_MAP_ROTATION_RUN', {
            phase: 'done',
            period,
            population: 0,
            assigned: 0,
            skipped: 0,
            errors,
        })
        return { period, population: 0, assigned: 0, skipped: 0, errors }
    }

    const contractorIds = ((contractorRows ?? []) as Array<{ id: string }>).map((c) => c.id)

    // Historia przydziałów całej populacji jednym zapytaniem — cykl B→C→D liczy
    // się z ostatniego przydziału sprzed kwartału, więc potrzebujemy wszystkich.
    const { data: assignmentRows, error: assignmentError } = await admin
        .from('tech_block_assignments')
        .select('contractor_id, period_year, period_quarter, block, source')

    if (assignmentError) {
        errors.push(`tech_block_assignments: ${assignmentError.message}`)
        await logAudit(actorUserId, 'TECH_MAP_ROTATION_RUN', {
            phase: 'done',
            period,
            population: contractorIds.length,
            assigned: 0,
            skipped: 0,
            errors,
        })
        return { period, population: contractorIds.length, assigned: 0, skipped: 0, errors }
    }

    const byContractor = new Map<string, AssignmentLike[]>()
    for (const row of (assignmentRows ?? []) as Array<AssignmentLike & { contractor_id: string }>) {
        const list = byContractor.get(row.contractor_id)
        const entry: AssignmentLike = {
            period_year: row.period_year,
            period_quarter: row.period_quarter,
            block: row.block,
            source: row.source,
        }
        if (list) list.push(entry)
        else byContractor.set(row.contractor_id, [entry])
    }

    const candidates: RotationCandidate[] = contractorIds.map((id) => ({
        contractorId: id,
        assignments: byContractor.get(id) ?? [],
    }))

    const inserts = computeRotationInserts(candidates, year, quarter)

    let assigned = 0
    if (inserts.length > 0) {
        // `.select()` zwraca wiersze REALNIE wstawione — przy ignoreDuplicates
        // wyścig z fallbackiem zapisu karty po cichu pomija część, więc liczenie
        // `inserts.length` zawyżałoby statystykę w audycie.
        const { data: insertedRows, error: insertError } = await admin
            .from('tech_block_assignments')
            .upsert(inserts, {
                onConflict: 'contractor_id,period_year,period_quarter',
                ignoreDuplicates: true,
            })
            .select('id')
        if (insertError) {
            // Wyścig z zapisem karty (fallback z Etapu 1) jest nieszkodliwy —
            // następny przebieg dokończy robotę.
            errors.push(`upsert: ${insertError.message}`)
            logger.warn({ event: 'tech_map_rotation.upsert_failed', error: insertError.message })
        } else {
            assigned = (insertedRows ?? []).length
        }
    }

    const stats: RotationSweepStats = {
        period,
        population: contractorIds.length,
        assigned,
        skipped: contractorIds.length - inserts.length,
        errors,
    }

    await logAudit(actorUserId, 'TECH_MAP_ROTATION_RUN', { phase: 'done', ...stats })
    return stats
}
