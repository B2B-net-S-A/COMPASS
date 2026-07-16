// Phase 39 bench — seeding wydzielony z listBench (audyt 2026-07-16, P1.8).
//
// Wcześniej samo wejście na zakładkę Exit WSTAWIAŁO wiersze do contractor_bench
// (zapis podczas renderowania) i seedowało też zejścia typu "internalizacja"
// (konwersja kontraktor→pracownik — tej osobie NIE szukamy projektu).
//
// Teraz: GET/render jest czysty; seeding to jawna, idempotentna komenda wołana
// z jobów, które tworzą zejścia (cron tc-sync + ręczny import Zejść).

import type { ServiceClient } from '@/lib/contractors/import-core'
import { logger } from '@/lib/logger'

/** Okno auto-seedu: zejścia z ostatnich N dni (albo bez daty / przyszłe). */
export const BENCH_SEED_WINDOW_DAYS = 90

export interface BenchSeedDeparture {
    id: string
    contractor_id: string | null
    consultant_name: string
    client_name: string
    position: string | null
    departure_date: string | null
    last_notice_day: string | null
    who_resigned: string | null
}

/**
 * Czysta selekcja kandydatów do seedu:
 *  - pomija zejścia już reprezentowane na benchu (również dismissed — slot zostaje),
 *  - pomija internalizację (konwersja, nie odejście — audyt P1.8),
 *  - kwalifikuje zejścia bez daty albo z datą >= cutoff (niedawne/przyszłe).
 */
export function filterBenchSeedCandidates(
    departures: BenchSeedDeparture[],
    seededDepartureIds: ReadonlySet<string>,
    cutoffISO: string,
): BenchSeedDeparture[] {
    return departures.filter((dep) => {
        if (seededDepartureIds.has(dep.id)) return false
        if ((dep.who_resigned ?? '').toLowerCase() === 'internalizacja') return false
        if (dep.departure_date !== null && dep.departure_date < cutoffISO) return false
        return true
    })
}

/**
 * Idempotentny seed benchu z niedawnych/przyszłych zejść. Wołać po imporcie
 * Zejść (cron tc-sync, ręczny commit importu) — nigdy z widoku.
 */
export async function seedBenchFromRecentDepartures(
    admin: ServiceClient,
    now: Date = new Date(),
): Promise<{ scanned: number; seeded: number }> {
    const { data: existing, error: existingError } = await admin
        .from('contractor_bench')
        .select('departure_id')
        .not('departure_id', 'is', null)
    if (existingError) throw new Error(`bench_seed_existing_read: ${existingError.message}`)
    const seeded = new Set(
        ((existing ?? []) as Array<{ departure_id: string | null }>)
            .map((r) => r.departure_id)
            .filter((id): id is string => id !== null),
    )

    const cutoff = new Date(now.getTime() - BENCH_SEED_WINDOW_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10)
    const { data: deps, error: depsError } = await admin
        .from('client_departures')
        .select('id, contractor_id, consultant_name, client_name, position, departure_date, last_notice_day, who_resigned')
        .or(`departure_date.is.null,departure_date.gte.${cutoff}`)
    if (depsError) throw new Error(`bench_seed_departures_read: ${depsError.message}`)

    const candidates = filterBenchSeedCandidates(
        (deps ?? []) as BenchSeedDeparture[],
        seeded,
        cutoff,
    )
    if (candidates.length === 0) {
        return { scanned: (deps ?? []).length, seeded: 0 }
    }

    const { error: insertError } = await admin.from('contractor_bench').insert(
        candidates.map((d) => ({
            departure_id: d.id,
            contractor_id: d.contractor_id,
            consultant_name: d.consultant_name,
            client_name: d.client_name,
            role: d.position,
            departure_date: d.departure_date,
            notice_date: d.last_notice_day,
            source: 'auto' as const,
        })),
    )
    if (insertError) {
        // 23505 przy wyścigu równoległych jobów — kolejny run doseeduje resztę.
        logger.warn({ event: 'bench_seed.insert_failed', error: insertError.message })
        return { scanned: (deps ?? []).length, seeded: 0 }
    }

    logger.info({ event: 'bench_seed.completed', seeded: candidates.length })
    return { scanned: (deps ?? []).length, seeded: candidates.length }
}
