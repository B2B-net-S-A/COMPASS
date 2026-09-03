// ─── Kto jest pod opieką Talent Community ────────────────────────────────────
// Czysty moduł (bez zależności serwerowych) — reguła „kto jest na liście" jest
// nietrywialna i ma testy jednostkowe zamiast tylko ręcznego sprawdzenia na prodzie.
//
// DLACZEGO NIE `contractors.status`: na produkcji wszystkie 688 rekordów mają
// 'active', bo taki był default importu. Lista oparta na tym polu dałaby TCM pod
// opiekę ludzi, którzy odeszli lata temu. Sytuację rozstrzygamy więc z ruchu
// u klientów:
//   • u_klienta — ostatnie wejście nie ma po sobie zejścia,
//   • bench     — niezdjęty wpis na ławce (między projektami, też wymaga kontaktu).

import type { BenchStatus, CareSituation } from '@/lib/types/contractor'

export interface CareEntryRow {
    contractor_id: string | null
    client_name: string | null
    position: string | null
    start_date: string | null
}

export interface CareDepartureRow {
    contractor_id: string | null
    departure_date: string | null
}

export interface CareBenchRow {
    contractor_id: string | null
    client_name: string | null
    role: string | null
    departure_date: string | null
    status: BenchStatus
}

/** Sytuacja jednej osoby, zanim doklei się do niej dane z `contractors`. */
export interface CareSituationInfo {
    situation: CareSituation
    clientName: string | null
    position: string | null
    sinceDate: string | null
    benchStatus: BenchStatus | null
}

/** Najpóźniejszy wiersz per kontraktor; `null` w dacie przegrywa z każdą datą. */
function latestByContractor<T extends { contractor_id: string | null }>(
    rows: readonly T[],
    dateOf: (row: T) => string | null,
): Map<string, { date: string | null; row: T }> {
    const out = new Map<string, { date: string | null; row: T }>()
    for (const row of rows) {
        if (!row.contractor_id) continue
        const date = dateOf(row)
        const seen = out.get(row.contractor_id)
        // Daty są ISO (YYYY-MM-DD), więc porównanie leksykalne = chronologiczne.
        if (!seen || (date !== null && (seen.date === null || date > seen.date))) {
            out.set(row.contractor_id, { date, row })
        }
    }
    return out
}

/**
 * Rozstrzyga, kto trafia na listę opieki i dlaczego.
 *
 * Zwraca mapę `contractorId → sytuacja`; wywołujący dociąga po tych kluczach
 * rekordy z `contractors` (nazwisko i opiekun to źródło prawdy tam, nie
 * w snapshotach wejść).
 */
export function resolveCareSituations(input: {
    entries: readonly CareEntryRow[]
    departures: readonly CareDepartureRow[]
    bench: readonly CareBenchRow[]
}): Map<string, CareSituationInfo> {
    const lastEntry = latestByContractor(input.entries, (r) => r.start_date)
    const lastDeparture = latestByContractor(input.departures, (r) => r.departure_date)

    const out = new Map<string, CareSituationInfo>()

    for (const [contractorId, entry] of lastEntry) {
        const departure = lastDeparture.get(contractorId)
        // Wejście bez daty uznajemy za aktualne tylko wtedy, gdy nie odnotowano
        // żadnego zejścia — inaczej import bez daty cofałby ludziom fakt odejścia.
        const stillThere = !departure
            || (entry.date !== null && (departure.date === null || departure.date < entry.date))
        if (!stillThere) continue
        out.set(contractorId, {
            situation: 'u_klienta',
            clientName: entry.row.client_name,
            position: entry.row.position,
            sinceDate: entry.row.start_date,
            benchStatus: null,
        })
    }

    // Kilka niezdjętych wpisów benchowych na jedną osobę jest możliwe (auto-seed
    // z każdego zejścia + wpisy ręczne). Wybieramy najnowszy zamiast pierwszego
    // z brzegu — inaczej o tym, który klient i etap zobaczy TCM, decydowałaby
    // kolejność skanowania w Postgresie, więc ekran potrafiłby pokazać co innego
    // po każdym odświeżeniu.
    const lastBench = latestByContractor(input.bench, (r) => r.departure_date)

    for (const [contractorId, bench] of lastBench) {
        // Praca u klienta wygrywa z ławką: świeże wejście przy niezdjętym starym
        // wpisie benchowym znaczy, że ktoś już pracuje — nie czeka na projekt.
        if (out.has(contractorId)) continue
        out.set(contractorId, {
            situation: 'bench',
            clientName: bench.row.client_name,
            position: bench.row.role,
            sinceDate: bench.row.departure_date,
            benchStatus: bench.row.status,
        })
    }

    return out
}
