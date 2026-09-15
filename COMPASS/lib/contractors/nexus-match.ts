/**
 * Dopasowanie kontraktorów COMPASS ↔ NEXUS — czysta reguła, bez sieci i bazy.
 *
 * COMPASS ma ~715 kontraktorów, z czego ZERO ma e-mail i zero `profile_id`;
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
 * Błędne sklejenie dwóch osób jest ciche, trwałe i niesie dane osobowe.
 *
 * KOTWICĄ JEST OSOBA, NIE KONTRAKT (audyt integracji 14.09, INT-06)
 * -----------------------------------------------------------------
 * Eksport NEXUSA ma wiersz na KONTRAKT. Jedna osoba z dwiema umowami dawała
 * dawniej `ambiguous`, a nowa umowa tej samej osoby zrywała powiązanie.
 * Dziś wiersze grupujemy po `candidate.id`; `nexus_candidate_id` to trwała
 * tożsamość, a `nexus_contract_id` jest tylko „bieżącym kontraktem" tej
 * osoby, odświeżanym przy każdym biegu. Kolejność eksportu nie ma znaczenia.
 *
 * DWA RÓŻNE „NIE MA W NEXUSIE" (audyt integracji 14.09, INT-02)
 * -------------------------------------------------------------
 * `auto_not_found` = automat nie znalazł nikogo w TYM biegu. Nie jest decyzją
 * i kolejny bieg ocenia wiersz od nowa — osoba mogła się pojawić w NEXUSIE.
 * `dismissed` = człowiek stwierdził „tej osoby nie ma" (z powodem). Tylko to
 * jest chronione przed automatem. Do 15.09 oba znaczyły `not_found`, więc
 * pierwszy bieg bez trafienia zamieniał się w trwałe odrzucenie (388 osób).
 */

export type NexusContractor = {
    nexus_contract_id: number
    candidate: { id: number; name: string | null; lastname: string | null; email: string | null }
    client_id?: number | null
    client_name: string | null
    job_title: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
    lacks_current_order: boolean
    updated_at?: string | null
}

export type CompassContractor = {
    id: string
    full_name: string
    email: string | null
    nexus_contract_id: number | null
    /** Trwała tożsamość osoby w NEXUSIE (od 15.09). */
    nexus_candidate_id?: number | null
    /**
     * Poprzedni werdykt. Niesiony TUTAJ, a nie odfiltrowywany w zapytaniu,
     * bo `dismissed` to DECYZJA CZŁOWIEKA — a decyzje mają być chronione przez
     * regułę, którą da się przetestować, nie przez klauzulę WHERE u wołającego.
     */
    nexus_match_status?: string | null
}

export type MatchStatus = 'linked' | 'pending' | 'ambiguous' | 'auto_not_found' | 'dismissed'

/** Maszynowy powód werdyktu automatu — zapisywany w `nexus_match_reason`. */
export type MatchReason =
    | 'duplicate_compass_email'
    | 'nexus_person_already_linked'
    | 'nexus_person_linked_twice'
    | 'multiple_nexus_people'

export type MatchDecision = {
    contractorId: string
    nexusContractId: number | null
    nexusCandidateId: number | null
    status: MatchStatus
    /** Podpowiedzi dla człowieka (bieżące kontrakty osób) — WYŁĄCZNIE do wyświetlenia. */
    suggestions: number[]
    reason: MatchReason | null
}

/** `lower(trim(...))` + zwinięcie wewnętrznych spacji — jak `normalizePersonName`. */
export function nameKey(raw: string | null | undefined): string {
    return (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function emailKey(raw: string | null | undefined): string {
    return (raw ?? '').trim().toLowerCase()
}

/** Imię i nazwisko osoby z NEXUSA w kolejności „Imię Nazwisko". */
export function nexusFullName(c: NexusContractor): string {
    return `${c.candidate.name ?? ''} ${c.candidate.lastname ?? ''}`.trim().replace(/\s+/g, ' ')
}

/**
 * Klucze nazwiska osoby z NEXUSA: „imię nazwisko" i „nazwisko imię".
 * Kartoteka COMPASSA bywa pisana w obu kolejnościach; przestawienie słów nie
 * jest zgadywaniem, a nazwisko i tak służy tylko do podpowiedzi.
 */
function nexusNameKeys(c: NexusContractor): string[] {
    const direct = nameKey(`${c.candidate.name ?? ''} ${c.candidate.lastname ?? ''}`)
    const reversed = nameKey(`${c.candidate.lastname ?? ''} ${c.candidate.name ?? ''}`)
    return Array.from(new Set([direct, reversed].filter(Boolean)))
}

/** Czy nazwisko z kartoteki COMPASSA zgadza się z osobą z NEXUSA. */
export function namesMatch(compassFullName: string, nexus: NexusContractor): boolean {
    const key = nameKey(compassFullName)
    return key !== '' && nexusNameKeys(nexus).includes(key)
}

const LIVE_STATUSES = new Set(['active', 'ending'])

/**
 * Bieżący kontrakt osoby: najpierw trwający (`active`/`ending`), potem
 * najpóźniejszy start, na końcu najwyższe id — deterministycznie, bez
 * zależności od kolejności eksportu.
 */
export function currentContract(rows: readonly NexusContractor[]): NexusContractor | null {
    let best: NexusContractor | null = null
    for (const row of rows) {
        if (!best) {
            best = row
            continue
        }
        const liveRow = LIVE_STATUSES.has(row.status ?? '')
        const liveBest = LIVE_STATUSES.has(best.status ?? '')
        if (liveRow !== liveBest) {
            if (liveRow) best = row
            continue
        }
        const startRow = row.start_date ?? ''
        const startBest = best.start_date ?? ''
        if (startRow !== startBest) {
            if (startRow > startBest) best = row
            continue
        }
        if (row.nexus_contract_id > best.nexus_contract_id) best = row
    }
    return best
}

/** Wiersze eksportu pogrupowane po osobie (`candidate.id`). */
export function groupByPerson(nexus: readonly NexusContractor[]): Map<number, NexusContractor[]> {
    const people = new Map<number, NexusContractor[]>()
    for (const row of nexus) {
        const bucket = people.get(row.candidate.id)
        if (bucket) bucket.push(row)
        else people.set(row.candidate.id, [row])
    }
    return people
}

function addToSet(map: Map<string, Set<number>>, key: string, value: number) {
    const set = map.get(key)
    if (set) set.add(value)
    else map.set(key, new Set([value]))
}

/**
 * Rozstrzyga, co zrobić z każdym kontraktorem COMPASSA.
 *
 * Automat linkuje WYŁĄCZNIE wtedy, gdy e-mail jest unikalny PO OBU STRONACH
 * (jedna osoba w NEXUSIE, jeden kontraktor w COMPASSIE), a ta osoba nie jest
 * już powiązana z kimś innym. Wszystko inne idzie do człowieka.
 */
export function decideMatches(
    compass: readonly CompassContractor[],
    nexus: readonly NexusContractor[],
): MatchDecision[] {
    const people = groupByPerson(nexus)
    const personByContract = new Map<number, number>()
    const peopleByEmail = new Map<string, Set<number>>()
    const peopleByName = new Map<string, Set<number>>()
    for (const row of nexus) {
        personByContract.set(row.nexus_contract_id, row.candidate.id)
        const e = emailKey(row.candidate.email)
        if (e) addToSet(peopleByEmail, e, row.candidate.id)
        for (const key of nexusNameKeys(row)) addToSet(peopleByName, key, row.candidate.id)
    }

    // Unikalność po stronie COMPASSA: dwóch kontraktorów z tym samym adresem
    // dostawało dawniej ten sam kontrakt — pierwszy „wygrywał" kolejnością
    // danych, drugi padał na indeksie unikalnym.
    const compassByEmail = new Map<string, number>()
    for (const c of compass) {
        const e = emailKey(c.email)
        if (e) compassByEmail.set(e, (compassByEmail.get(e) ?? 0) + 1)
    }

    // Kto już „trzyma" osobę: po trwałej kotwicy albo po starym kontrakcie.
    const personOf = (c: CompassContractor): number | null => {
        if (c.nexus_candidate_id != null) return c.nexus_candidate_id
        if (c.nexus_contract_id != null) return personByContract.get(c.nexus_contract_id) ?? null
        return null
    }
    const claimants = new Map<number, number>()
    for (const c of compass) {
        const person = personOf(c)
        if (person != null) claimants.set(person, (claimants.get(person) ?? 0) + 1)
    }

    const suggestionIds = (ids: Iterable<number>): number[] =>
        Array.from(ids)
            .map((id) => currentContract(people.get(id) ?? [])?.nexus_contract_id)
            .filter((id): id is number => typeof id === 'number')
            .sort((a, b) => a - b)

    return compass.map((c): MatchDecision => {
        const unresolved = {
            contractorId: c.id,
            nexusContractId: null,
            nexusCandidateId: null,
            suggestions: [] as number[],
            reason: null,
        }

        // ── 1. Już powiązany — decyzja stoi, odświeżamy tylko bieżący kontrakt.
        if (c.nexus_candidate_id != null || c.nexus_contract_id != null) {
            const keepAsIs = {
                contractorId: c.id,
                status: 'linked' as const,
                nexusContractId: c.nexus_contract_id,
                nexusCandidateId: c.nexus_candidate_id ?? null,
                suggestions: [],
            }
            const person = personOf(c)
            if (person == null) {
                // Stary kontrakt zniknął z eksportu, a osoby nie znamy. Nie
                // zrywamy decyzji człowieka — zostawiamy ją taką, jaka była.
                return { ...keepAsIs, reason: null }
            }
            if ((claimants.get(person) ?? 0) > 1) {
                // Dwóch kontraktorów trzyma tę samą osobę. Nic nie przepinamy —
                // człowiek musi rozstrzygnąć, które powiązanie jest błędne.
                return { ...keepAsIs, reason: 'nexus_person_linked_twice' }
            }
            return {
                ...keepAsIs,
                // Brak żywego kontraktu = powiązanie osoby zostaje, kontrakt NULL.
                nexusContractId: currentContract(people.get(person) ?? [])?.nexus_contract_id ?? null,
                nexusCandidateId: person,
                reason: null,
            }
        }

        // ── 2. Ręczne odrzucenie — jedyny stan chroniony przed automatem.
        if (c.nexus_match_status === 'dismissed') {
            return { ...unresolved, status: 'dismissed' }
        }

        // ── 3. E-mail (unikalny po obu stronach).
        const e = emailKey(c.email)
        const emailPeople = e ? Array.from(peopleByEmail.get(e) ?? []) : []
        if (emailPeople.length > 0) {
            const suggestions = suggestionIds(emailPeople)
            if ((compassByEmail.get(e) ?? 0) > 1) {
                return { ...unresolved, status: 'ambiguous', suggestions, reason: 'duplicate_compass_email' }
            }
            if (emailPeople.length > 1) {
                // Ten sam adres u dwóch różnych osób. Automat NIE wybiera.
                return { ...unresolved, status: 'ambiguous', suggestions, reason: 'multiple_nexus_people' }
            }
            const person = emailPeople[0]
            if ((claimants.get(person) ?? 0) > 0) {
                return {
                    ...unresolved,
                    status: 'ambiguous',
                    suggestions,
                    reason: 'nexus_person_already_linked',
                }
            }
            return {
                ...unresolved,
                status: 'linked',
                nexusContractId: currentContract(people.get(person) ?? [])?.nexus_contract_id ?? null,
                nexusCandidateId: person,
            }
        }

        // ── 4. Nazwisko — wyłącznie PODPOWIEDŹ dla człowieka.
        const namePeople = Array.from(peopleByName.get(nameKey(c.full_name)) ?? [])
        if (namePeople.length === 0) {
            return { ...unresolved, status: 'auto_not_found' }
        }
        return {
            ...unresolved,
            // Jedno trafienie po nazwisku to nadal NIE jest pewność — to
            // podpowiedź. Dlatego `pending`, a nie `linked`.
            status: namePeople.length === 1 ? 'pending' : 'ambiguous',
            suggestions: suggestionIds(namePeople),
            reason: namePeople.length === 1 ? null : 'multiple_nexus_people',
        }
    })
}

/** Podpowiedź dla kolejki ręcznej — jedna osoba z NEXUSA z bieżącym kontraktem. */
export type NexusSuggestion = {
    nexusCandidateId: number
    nexusContractId: number
    fullName: string
    email: string | null
    clientName: string | null
    jobTitle: string | null
    status: string | null
    startDate: string | null
    endDate: string | null
    contractCount: number
    matchedBy: 'email' | 'name'
}

/**
 * Podpowiedzi liczone PRZY ODCZYCIE kolejki (nic nie zapisujemy): osoby
 * z ostatniego eksportu NEXUSA, które pasują e-mailem albo nazwiskiem.
 * E-mail idzie pierwszy — jest mocniejszym sygnałem.
 */
export function suggestionsFor(
    contractor: Pick<CompassContractor, 'full_name' | 'email'>,
    snapshot: readonly NexusContractor[],
): NexusSuggestion[] {
    const e = emailKey(contractor.email)
    const key = nameKey(contractor.full_name)
    const out: NexusSuggestion[] = []
    for (const [personId, rows] of Array.from(groupByPerson(snapshot))) {
        const current = currentContract(rows)
        if (!current) continue
        const byEmail = e !== '' && rows.some((r) => emailKey(r.candidate.email) === e)
        const byName = key !== '' && rows.some((r) => nexusNameKeys(r).includes(key))
        if (!byEmail && !byName) continue
        out.push({
            nexusCandidateId: personId,
            nexusContractId: current.nexus_contract_id,
            fullName: nexusFullName(current),
            email: current.candidate.email,
            clientName: current.client_name,
            jobTitle: current.job_title,
            status: current.status,
            startDate: current.start_date,
            endDate: current.end_date,
            contractCount: rows.length,
            matchedBy: byEmail ? 'email' : 'name',
        })
    }
    return out.sort((a, b) => {
        if (a.matchedBy !== b.matchedBy) return a.matchedBy === 'email' ? -1 : 1
        return a.nexusContractId - b.nexusContractId
    })
}

/** Podsumowanie przebiegu — to, co trafia do heartbeatu i do odpowiedzi. */
export function summarize(decisions: readonly MatchDecision[]) {
    const counts: Record<MatchStatus, number> = {
        linked: 0,
        pending: 0,
        ambiguous: 0,
        auto_not_found: 0,
        dismissed: 0,
    }
    for (const d of decisions) counts[d.status] += 1
    return counts
}
