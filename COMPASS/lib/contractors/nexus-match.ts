/**
 * Dopasowanie kontraktorów COMPASS ↔ NEXUS — czysta reguła, bez sieci i bazy.
 *
 * COMPASS ma 689 kontraktorów, z czego ZERO ma e-mail i zero `profile_id`;
 * tożsamością jest samo `lower(trim(full_name))`. NEXUS zna te osoby z
 * e-mailem — i to jest jedyny klucz, po którym da się je połączyć bez
 * zgadywania.
 *
 * DLACZEGO AUTOMAT NIE DOPASOWUJE PO NAZWISKU
 * -------------------------------------------
 * Compass podjął tę decyzję już raz i warto ją powtórzyć, nie wymyślać od
 * nowa: migracja `20260714183425_consultant_success_hub.sql` wypełniała
 * `contractors.profile_id` wyłącznie po unikalnym e-mailu po OBU stronach,
 * z komentarzem wprost — „Name matching is intentionally forbidden".
 *
 * Tutaj problem jest ten sam, tylko większy: 689 nazwisk kontra ~49 tys.
 * kandydatów w NEXUSIE. Nazwiska są dziś unikalne WEWNĄTRZ Compassa (689 nazw
 * = 689 rekordów), więc ryzyko nie leży w tej bazie — leży na styku. Błędne
 * sklejenie dwóch osób jest ciche, trwałe i niesie dane osobowe.
 *
 * PUŁAPKA, KTÓRA JUŻ RAZ ZABOLAŁA
 * -------------------------------
 * Klucz naturalny rozjeżdża się między SQL-em a TypeScriptem: indeks to
 * `lower(trim(full_name))`, ale Postgres `trim()` NIE zwija wewnętrznych
 * spacji, a `normalizePersonName` w TS — zwija. `resolveOrCreateContractor`
 * obchodzi to prefiltrem `ilike`. Tutaj nazwisko służy wyłącznie do
 * PODPOWIEDZI dla człowieka, nigdy do automatycznego linkowania, więc
 * rozjazd nie może nic zepsuć.
 */

export type NexusContractor = {
    nexus_contract_id: number
    candidate: { id: number; name: string | null; lastname: string | null; email: string | null }
    client_name: string | null
    job_title: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
    lacks_current_order: boolean
}

export type CompassContractor = {
    id: string
    full_name: string
    email: string | null
    nexus_contract_id: number | null
    /**
     * Poprzedni werdykt. Niesiony TUTAJ, a nie odfiltrowywany w zapytaniu,
     * bo `not_found` to DECYZJA CZŁOWIEKA („tej osoby nie ma w NEXUSIE"),
     * a nie brak decyzji — a decyzje mają być chronione przez regułę, którą
     * da się przetestować, nie przez klauzulę WHERE u wołającego.
     */
    nexus_match_status?: string | null
}

export type MatchStatus = 'linked' | 'pending' | 'ambiguous' | 'not_found'

export type MatchDecision = {
    contractorId: string
    nexusContractId: number | null
    status: MatchStatus
    /** Podpowiedzi dla człowieka — WYŁĄCZNIE do wyświetlenia w kolejce. */
    suggestions: number[]
}

/** `lower(trim(...))` + zwinięcie wewnętrznych spacji — jak `normalizePersonName`. */
export function nameKey(raw: string | null | undefined): string {
    return (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function emailKey(raw: string | null | undefined): string {
    return (raw ?? '').trim().toLowerCase()
}

function fullName(c: NexusContractor): string {
    return nameKey(`${c.candidate.name ?? ''} ${c.candidate.lastname ?? ''}`)
}

/**
 * Rozstrzyga, co zrobić z każdym kontraktorem COMPASSA.
 *
 * Automat linkuje WYŁĄCZNIE wtedy, gdy e-mail trafia dokładnie jeden raz.
 * Wszystko inne — w tym każde trafienie wielokrotne — idzie do człowieka.
 */
export function decideMatches(
    compass: readonly CompassContractor[],
    nexus: readonly NexusContractor[],
): MatchDecision[] {
    const byEmail = new Map<string, NexusContractor[]>()
    const byName = new Map<string, NexusContractor[]>()

    for (const row of nexus) {
        const e = emailKey(row.candidate.email)
        if (e) {
            const bucket = byEmail.get(e)
            if (bucket) bucket.push(row)
            else byEmail.set(e, [row])
        }
        const n = fullName(row)
        if (n) {
            const bucket = byName.get(n)
            if (bucket) bucket.push(row)
            else byName.set(n, [row])
        }
    }

    return compass.map((c): MatchDecision => {
        // Już powiązany — nie ruszamy. Ponowne rozstrzyganie mogłoby cofnąć
        // decyzję, którą podjął człowiek w kolejce.
        if (c.nexus_contract_id !== null) {
            return {
                contractorId: c.id,
                nexusContractId: c.nexus_contract_id,
                status: 'linked',
                suggestions: [],
            }
        }

        // Odrzucony ręcznie („nie ma go w NEXUSIE") — też jest decyzją i też
        // jej nie ruszamy. Sam `nexus_contract_id` NIE wystarczy jako strażnik:
        // odrzucony wiersz ma tu `null`, więc bez tego warunku najbliższy
        // przebieg crona trafiłby go po nazwisku, wystawił `pending` i cicho
        // skasował werdykt człowieka — a ten wróciłby do kolejki, z której
        // został świadomie usunięty.
        if (c.nexus_match_status === 'not_found') {
            return {
                contractorId: c.id,
                nexusContractId: null,
                status: 'not_found',
                suggestions: [],
            }
        }

        const e = emailKey(c.email)
        const emailHits = e ? (byEmail.get(e) ?? []) : []
        if (emailHits.length === 1) {
            return {
                contractorId: c.id,
                nexusContractId: emailHits[0].nexus_contract_id,
                status: 'linked',
                suggestions: [],
            }
        }
        if (emailHits.length > 1) {
            // Ten sam adres na dwóch kontraktach. Automat NIE wybiera — wybór
            // jednego z nich byłby zgadywaniem, którego nikt by nie zauważył.
            return {
                contractorId: c.id,
                nexusContractId: null,
                status: 'ambiguous',
                suggestions: emailHits.map((h) => h.nexus_contract_id),
            }
        }

        // Bez e-maila (dziś: wszystkie 689) schodzimy do PODPOWIEDZI po
        // nazwisku — ale tylko po to, żeby człowiek nie szukał ręcznie.
        const nameHits = byName.get(nameKey(c.full_name)) ?? []
        if (nameHits.length === 0) {
            return {
                contractorId: c.id,
                nexusContractId: null,
                status: 'not_found',
                suggestions: [],
            }
        }
        return {
            contractorId: c.id,
            nexusContractId: null,
            // Jedno trafienie po nazwisku to nadal NIE jest pewność — to
            // podpowiedź. Dlatego `pending`, a nie `linked`.
            status: nameHits.length === 1 ? 'pending' : 'ambiguous',
            suggestions: nameHits.map((h) => h.nexus_contract_id),
        }
    })
}

/** Podsumowanie przebiegu — to, co trafia do heartbeatu i do odpowiedzi. */
export function summarize(decisions: readonly MatchDecision[]) {
    const counts: Record<MatchStatus, number> = {
        linked: 0,
        pending: 0,
        ambiguous: 0,
        not_found: 0,
    }
    for (const d of decisions) counts[d.status] += 1
    return counts
}
