// „Ludzie w NEXUSIE” — lista osób z NEXUSA (`GET /api/integrations/compass/roster`).
//
// Po przeniesieniu modułu `lifecycle` źródłem prawdy o zatrudnieniu jest NEXUS,
// a Compass (Akademia) tylko przyjmuje jego stan. Kierunek odwrotny niż
// `/api/internal/roster`, z którego do przełączenia czytał NEXUS.
//
// Czysta reguła (bez bazy i sieci) — trasa `app/api/cron/nexus-roster-sync` ją woła.
//
// ZASADY, każda z powodem:
//   • Dopasowanie WYŁĄCZNIE po e-mailu (bez wielkości liter). Nazwiska nie łączymy
//     (ten sam zakaz co w `lib/contractors/nexus-match.ts`). E-mail zdublowany po
//     stronie Compassa = nie zgadujemy, osoba czeka.
//   • Zmieniamy tylko status zatrudnienia, przełożonego i daty. Rolę prowadzi Compass
//     (o roli w Akademii decyduje Compass), nazwisko/dział/stanowisko — M365.
//   • `exited` wyłącznie z jawnego statusu w odpowiedzi. Brak osoby na liście NIE jest
//     odejściem (lista może być niepełna, a odejście odbiera dostęp).
//   • Przebieg, który dałby `exited` więcej niż MAX_EXITS_PER_RUN osobom naraz, nie
//     zmienia NIKOGO — lustro `MAX_DEACTIVATIONS_PER_RUN` w NEXUSIE. Masowe odejście
//     wygląda dokładnie jak awaria po drugiej stronie; niech zdecyduje człowiek.
//     Tak samo masowy powrót z `exited` (MAX_RETURNS_PER_RUN): zdejmuje blokady kont,
//     więc zbyt hojna lista oddałaby dostęp byłym pracownikom jednym przebiegiem.
//   • Admina automat nie wyłącza (lustro `skipped_admin` w NEXUSIE): to on cofa błędne
//     odejście. Konto `admin` albo z SUPER_ADMIN_EMAILS nie dostaje `exited` z listy.
//   • Pusta lista, niezgodny `count` albo złamany kształt = awaria; nic nie zapisujemy.
//   • Przełożony: ustawiamy tylko, gdy NEXUS go podaje i da się go jednoznacznie znaleźć
//     w Compassie. Brak przełożonego w NEXUSIE nie czyści `manager_id` — od niego zależy,
//     kto widzi archiwum zespołu (RLS), a „nie wiem” to nie to samo co „nie ma”.

import { z } from 'zod'

export const EMPLOYMENT_STATUSES = ['pending', 'onboarding', 'active', 'offboarding', 'exited'] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

/** Bezpiecznik masowego odejścia (NEXUS: `MAX_DEACTIVATIONS_PER_RUN = 5`). */
export const MAX_EXITS_PER_RUN = 5
/** Bezpiecznik masowego powrotu — powrót zdejmuje blokadę konta w Auth. */
export const MAX_RETURNS_PER_RUN = 5

export type RosterRefusal = 'mass_exit' | 'mass_return'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// Domyślne `z.object` zrzuca pola spoza schematu — imię, dział i stanowisko z odpowiedzi
// NEXUSA nie wchodzą dalej niż parser.
const personSchema = z.object({
    email: z.string().trim().min(3),
    employment_status: z.enum(EMPLOYMENT_STATUSES),
    manager_email: z.string().trim().nullish(),
    work_start_date: isoDate.nullish(),
    last_working_day: isoDate.nullish(),
})

const payloadSchema = z.object({
    count: z.number().int().nonnegative(),
    people: z.array(personSchema),
})

export type NexusRosterPerson = z.infer<typeof personSchema>

/** Odpowiedź NEXUSA nie spełnia kontraktu — przebieg kończy się przed zapisem. */
export class RosterContractError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'RosterContractError'
    }
}

/**
 * Komunikaty bez treści wierszy: błąd trafia do heartbeatu i Sentry, a wiersze niosą
 * e-maile. Ścieżka pola (np. `people.3.employment_status`) wystarczy do diagnozy.
 */
export function parseNexusRoster(raw: unknown): NexusRosterPerson[] {
    const parsed = payloadSchema.safeParse(raw)
    if (!parsed.success) {
        const where = parsed.error.issues[0]?.path.join('.') || 'body'
        throw new RosterContractError(`NEXUS: lista osób niezgodna z kontraktem (${where})`)
    }
    if (parsed.data.people.length === 0) {
        throw new RosterContractError('NEXUS: pusta lista osób — traktujemy jak awarię')
    }
    if (parsed.data.count !== parsed.data.people.length) {
        throw new RosterContractError(
            `NEXUS: count=${parsed.data.count}, a osób ${parsed.data.people.length} — lista niekompletna`,
        )
    }
    return parsed.data.people
}

export interface CompassProfileRow {
    id: string
    email: string | null
    role: string | null
    employment_status: string | null
    manager_id: string | null
    work_start_date: string | null
    termination_date: string | null
}

export interface ProfilePatch {
    employment_status?: EmploymentStatus
    manager_id?: string
    work_start_date?: string
    termination_date?: string | null
}

export interface ProfileChange {
    id: string
    /** Status sprzed zmiany — warunek zapisu (zmiana w międzyczasie = pomijamy wiersz). */
    previousStatus: string | null
    patch: ProfilePatch
    /** Przejście do `exited`: odcięcie konta w Auth (jak `deactivateEmployee`). */
    exit: boolean
    /** Powrót z `exited`: zdjęcie blokady w Auth (jak `reactivateEmployee`). */
    returning: boolean
}

export interface RosterPlanStats {
    nexus_people: number
    matched: number
    unchanged: number
    to_update: number
    not_in_compass: number
    ambiguous_email: number
    duplicate_in_nexus: number
    manager_unknown: number
    exits: number
    returns: number
    /** Admin z `exited` na liście — status zostaje, decyduje człowiek. */
    skipped_admin: number
}

export interface RosterPlan {
    changes: ProfileChange[]
    stats: RosterPlanStats
    /** Bezpieczniki, które zadziałały. Niepusta lista = `changes` NIE wolno zapisać. */
    refusals: RosterRefusal[]
}

export interface RosterPlanOptions {
    maxExits?: number
    maxReturns?: number
    /** Konta, których automat nie wyłącza (admin, SUPER_ADMIN_EMAILS). */
    isProtected?: (row: CompassProfileRow) => boolean
}

const normEmail = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase()

const STILL_EMPLOYED: ReadonlySet<string> = new Set(['pending', 'onboarding', 'active'])
const LEAVING: ReadonlySet<string> = new Set(['offboarding', 'exited'])

export function planRosterSync(
    nexus: readonly NexusRosterPerson[],
    compass: readonly CompassProfileRow[],
    {
        maxExits = MAX_EXITS_PER_RUN,
        maxReturns = MAX_RETURNS_PER_RUN,
        isProtected = (row) => row.role === 'admin',
    }: RosterPlanOptions = {},
): RosterPlan {
    const compassByEmail = new Map<string, CompassProfileRow[]>()
    for (const row of compass) {
        const email = normEmail(row.email)
        if (!email) continue
        compassByEmail.set(email, [...(compassByEmail.get(email) ?? []), row])
    }

    const nexusCount = new Map<string, number>()
    for (const person of nexus) {
        const email = normEmail(person.email)
        nexusCount.set(email, (nexusCount.get(email) ?? 0) + 1)
    }

    const stats: RosterPlanStats = {
        nexus_people: nexus.length,
        matched: 0,
        unchanged: 0,
        to_update: 0,
        not_in_compass: 0,
        ambiguous_email: 0,
        duplicate_in_nexus: 0,
        manager_unknown: 0,
        exits: 0,
        returns: 0,
        skipped_admin: 0,
    }
    const changes: ProfileChange[] = []

    for (const person of nexus) {
        const email = normEmail(person.email)
        if ((nexusCount.get(email) ?? 0) > 1) {
            stats.duplicate_in_nexus += 1
            continue
        }
        const candidates = compassByEmail.get(email) ?? []
        if (candidates.length === 0) {
            stats.not_in_compass += 1
            continue
        }
        if (candidates.length > 1) {
            stats.ambiguous_email += 1
            continue
        }
        stats.matched += 1
        const row = candidates[0]
        const patch: ProfilePatch = {}

        if (person.employment_status !== row.employment_status) {
            if (person.employment_status === 'exited' && isProtected(row)) {
                stats.skipped_admin += 1
            } else {
                patch.employment_status = person.employment_status
            }
        }

        const managerEmail = normEmail(person.manager_email)
        if (managerEmail) {
            const managers = compassByEmail.get(managerEmail) ?? []
            if (managers.length === 1 && managers[0].id !== row.id) {
                if (managers[0].id !== row.manager_id) patch.manager_id = managers[0].id
            } else {
                stats.manager_unknown += 1
            }
        }

        if (person.work_start_date && person.work_start_date !== row.work_start_date) {
            patch.work_start_date = person.work_start_date
        }

        const comingBack = LEAVING.has(row.employment_status ?? '') && STILL_EMPLOYED.has(patch.employment_status ?? '')
        if (person.last_working_day) {
            if (person.last_working_day !== row.termination_date) patch.termination_date = person.last_working_day
        } else if (comingBack && row.termination_date !== null) {
            // Cofnięte odejście: bez tego raporty miesięczne (`employedInMonth`) dalej
            // traktowałyby osobę jako odeszłą — ta sama reguła co `reactivateEmployee`.
            patch.termination_date = null
        }

        if (Object.keys(patch).length === 0) {
            stats.unchanged += 1
            continue
        }
        const exit = patch.employment_status === 'exited'
        const returning = row.employment_status === 'exited'
            && patch.employment_status !== undefined
            && patch.employment_status !== 'exited'
        if (exit) stats.exits += 1
        if (returning) stats.returns += 1
        changes.push({ id: row.id, previousStatus: row.employment_status, patch, exit, returning })
    }

    stats.to_update = changes.length
    const refusals: RosterRefusal[] = []
    if (stats.exits > maxExits) refusals.push('mass_exit')
    if (stats.returns > maxReturns) refusals.push('mass_return')
    return { changes, stats, refusals }
}
