// Phase 46 (Etap 2) — agregacja kart wywiadów w mapę technologiczną klienta.
// Czysty moduł: wejściem są wiersze z DB, wyjściem gotowy widok. Bez I/O, bez dat
// systemowych (`todayISO` wstrzykiwany) — cała logika jest testowalna bez mocków.
//
// PRYWATNOŚĆ: wynik NIE zawiera nazwisk konsultantów ani id kart. Nazwiska są
// widoczne wyłącznie na poziomie pojedynczej karty (RLS lifecycle). Ta funkcja
// jest przygotowana pod przyszły read-only dostęp sprzedaży (Etap 3), gdzie
// agregat może wyjść poza zespół TCM.

import { isStale, STALE_MONTHS } from './freshness'
import type { InitiativeKind } from '@/lib/types/tech-map'

// ─── Wejście (kształt 1:1 z zapytaniami akcji) ──────────────────────────────

export interface AggCard {
    id: string
    client_area_id: string | null
    interview_date: string
    hiring: boolean | null
    hiring_roles: string[]
    hiring_source: string | null
    project_end_month: number | null
    project_end_year: number | null
    project_end_unknown: boolean
    tech_old_new: string | null
    vendors_note: string | null
    memorable_quote: string | null
    team_size: number | null
    team_externals: number | null
}

export interface AggLink {
    card_id: string
    /** Id pozycji słownikowej (technologia albo vendor). */
    ref_id: string
}

export interface AggInitiative {
    card_id: string
    name: string
    kind: InitiativeKind
    priority: string
}

export interface AggArea {
    id: string
    name: string
}

export interface AggDictItem {
    id: string
    name: string
}

// ─── Wyjście ────────────────────────────────────────────────────────────────

export interface TagAggregate {
    id: string
    name: string
    /** Liczba kart, na których pozycja wystąpiła. */
    mentions: number
    /** Data ostatniego potwierdzenia (najświeższa karta). */
    lastConfirmed: string
    /** Starsze niż STALE_MONTHS → „do odświeżenia". */
    stale: boolean
    /** Obszary, w których pozycję widziano (nazwy, nie id). */
    areas: string[]
}

export interface InitiativeAggregate {
    name: string
    kind: InitiativeKind
    /** TRUE gdy którakolwiek karta oznaczyła inicjatywę jako priorytetową. */
    highPriority: boolean
    mentions: number
    lastConfirmed: string
    stale: boolean
    areas: string[]
}

export interface DemandSignal {
    areaName: string | null
    roles: string[]
    source: string | null
    date: string
    stale: boolean
}

export interface ProjectEndEntry {
    areaName: string | null
    year: number
    month: number
    /** YYYY-MM — do sortowania i grupowania w UI. */
    period: string
}

export interface AreaCoverage {
    areaId: string | null
    areaName: string
    /** Liczba sfinalizowanych kart w obszarze. */
    cards: number
    /** Data ostatniej sfinalizowanej karty (null = brak danych). */
    lastAny: string | null
    /** Brak jakiejkolwiek karty w obszarze. */
    missing: boolean
    /** Ostatnia karta starsza niż próg świeżości. */
    stale: boolean
}

export interface ClientTechMap {
    totalCards: number
    lastInterviewDate: string | null
    technologies: TagAggregate[]
    vendors: TagAggregate[]
    initiatives: InitiativeAggregate[]
    demandSignals: DemandSignal[]
    projectEnds: ProjectEndEntry[]
    coverage: AreaCoverage[]
    /** Notatki tekstowe (stare/nowe, dostawcy, cytaty) — bez autora, z datą. */
    notes: Array<{ date: string; kind: 'tech_old_new' | 'vendors_note' | 'quote'; text: string }>
    teamSizeLatest: { size: number | null; externals: number | null; date: string } | null
}

// ─── Implementacja ──────────────────────────────────────────────────────────

const AREA_UNASSIGNED = '— bez obszaru —'

function areaNameOf(card: AggCard, areas: Map<string, string>): string | null {
    if (!card.client_area_id) return null
    return areas.get(card.client_area_id) ?? null
}

function pushUnique(list: string[], value: string | null): void {
    if (value && !list.includes(value)) list.push(value)
}

function aggregateTags(
    links: AggLink[],
    dict: Map<string, string>,
    cards: Map<string, AggCard>,
    areas: Map<string, string>,
    todayISO: string,
    staleMonths: number,
): TagAggregate[] {
    const acc = new Map<string, TagAggregate>()
    for (const link of links) {
        const card = cards.get(link.card_id)
        if (!card) continue
        const name = dict.get(link.ref_id)
        if (!name) continue

        const existing = acc.get(link.ref_id)
        if (existing) {
            existing.mentions += 1
            if (card.interview_date > existing.lastConfirmed) existing.lastConfirmed = card.interview_date
            pushUnique(existing.areas, areaNameOf(card, areas))
        } else {
            const areasList: string[] = []
            pushUnique(areasList, areaNameOf(card, areas))
            acc.set(link.ref_id, {
                id: link.ref_id,
                name,
                mentions: 1,
                lastConfirmed: card.interview_date,
                stale: false,
                areas: areasList,
            })
        }
    }

    return Array.from(acc.values())
        .map((t) => ({ ...t, stale: isStale(t.lastConfirmed, todayISO, staleMonths) }))
        .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, 'pl'))
}

/**
 * Buduje mapę technologiczną klienta z JEGO sfinalizowanych kart.
 * Drafty odfiltrowuje warstwa danych (akcja) — tu wchodzą już tylko karty gotowe.
 */
export function buildClientTechMap(input: {
    cards: AggCard[]
    areas: AggArea[]
    technologies: AggDictItem[]
    vendors: AggDictItem[]
    techLinks: AggLink[]
    vendorLinks: AggLink[]
    initiatives: AggInitiative[]
    todayISO: string
    staleMonths?: number
}): ClientTechMap {
    const staleMonths = input.staleMonths ?? STALE_MONTHS
    const cardById = new Map(input.cards.map((c) => [c.id, c]))
    const areaNames = new Map(input.areas.map((a) => [a.id, a.name]))
    const techNames = new Map(input.technologies.map((t) => [t.id, t.name]))
    const vendorNames = new Map(input.vendors.map((v) => [v.id, v.name]))

    // ── Technologie i vendorzy
    const technologies = aggregateTags(input.techLinks, techNames, cardById, areaNames, input.todayISO, staleMonths)
    const vendors = aggregateTags(input.vendorLinks, vendorNames, cardById, areaNames, input.todayISO, staleMonths)

    // ── Inicjatywy (klucz: nazwa po normalizacji + rodzaj)
    const iniAcc = new Map<string, InitiativeAggregate>()
    for (const ini of input.initiatives) {
        const card = cardById.get(ini.card_id)
        if (!card) continue
        const name = ini.name.trim()
        if (!name) continue
        const key = `${name.toLowerCase()}|${ini.kind}`
        const existing = iniAcc.get(key)
        if (existing) {
            existing.mentions += 1
            existing.highPriority = existing.highPriority || ini.priority === 'wysoki'
            if (card.interview_date > existing.lastConfirmed) existing.lastConfirmed = card.interview_date
            pushUnique(existing.areas, areaNameOf(card, areaNames))
        } else {
            const areasList: string[] = []
            pushUnique(areasList, areaNameOf(card, areaNames))
            iniAcc.set(key, {
                name,
                kind: ini.kind,
                highPriority: ini.priority === 'wysoki',
                mentions: 1,
                lastConfirmed: card.interview_date,
                stale: false,
                areas: areasList,
            })
        }
    }
    const initiatives = Array.from(iniAcc.values())
        .map((i) => ({ ...i, stale: isStale(i.lastConfirmed, input.todayISO, staleMonths) }))
        .sort(
            (a, b) =>
                Number(b.highPriority) - Number(a.highPriority) ||
                b.lastConfirmed.localeCompare(a.lastConfirmed) ||
                a.name.localeCompare(b.name, 'pl'),
        )

    // ── Sygnały popytu (tylko hiring=TRUE)
    const demandSignals: DemandSignal[] = input.cards
        .filter((c) => c.hiring === true)
        .map((c) => ({
            areaName: areaNameOf(c, areaNames),
            roles: c.hiring_roles.filter((r) => r.trim().length > 0),
            source: c.hiring_source,
            date: c.interview_date,
            stale: isStale(c.interview_date, input.todayISO, staleMonths),
        }))
        .sort((a, b) => b.date.localeCompare(a.date))

    // ── Oś końców projektów (karty z podaną parą miesiąc+rok)
    const projectEnds: ProjectEndEntry[] = input.cards
        .filter((c) => c.project_end_month !== null && c.project_end_year !== null)
        .map((c) => ({
            areaName: areaNameOf(c, areaNames),
            year: c.project_end_year as number,
            month: c.project_end_month as number,
            period: `${c.project_end_year}-${String(c.project_end_month).padStart(2, '0')}`,
        }))
        .sort((a, b) => a.period.localeCompare(b.period))

    // ── Pokrycie obszarów: który obszar ma dane i jak świeże (obszar bez kart = luka)
    const coverageKeys: Array<{ id: string | null; name: string }> = input.areas.map((a) => ({
        id: a.id,
        name: a.name,
    }))
    if (input.cards.some((c) => !c.client_area_id)) {
        coverageKeys.push({ id: null, name: AREA_UNASSIGNED })
    }

    const coverage: AreaCoverage[] = coverageKeys.map((area) => {
        const areaCards = input.cards.filter((c) => (c.client_area_id ?? null) === area.id)
        const lastAny = areaCards.reduce<string | null>(
            (acc, c) => (acc === null || c.interview_date > acc ? c.interview_date : acc),
            null,
        )
        return {
            areaId: area.id,
            areaName: area.name,
            cards: areaCards.length,
            lastAny,
            missing: lastAny === null,
            stale: lastAny !== null && isStale(lastAny, input.todayISO, staleMonths),
        }
    })

    // ── Notatki tekstowe (bez autora — anonimizacja agregatu)
    const notes: ClientTechMap['notes'] = []
    for (const c of input.cards) {
        if (c.tech_old_new?.trim()) {
            notes.push({ date: c.interview_date, kind: 'tech_old_new', text: c.tech_old_new.trim() })
        }
        if (c.vendors_note?.trim()) {
            notes.push({ date: c.interview_date, kind: 'vendors_note', text: c.vendors_note.trim() })
        }
        if (c.memorable_quote?.trim()) {
            notes.push({ date: c.interview_date, kind: 'quote', text: c.memorable_quote.trim() })
        }
    }
    notes.sort((a, b) => b.date.localeCompare(a.date))

    // ── Ostatnio raportowana wielkość zespołu
    const withTeam = input.cards
        .filter((c) => c.team_size !== null || c.team_externals !== null)
        .sort((a, b) => b.interview_date.localeCompare(a.interview_date))
    const teamSizeLatest = withTeam[0]
        ? { size: withTeam[0].team_size, externals: withTeam[0].team_externals, date: withTeam[0].interview_date }
        : null

    const lastInterviewDate = input.cards.reduce<string | null>(
        (acc, c) => (acc === null || c.interview_date > acc ? c.interview_date : acc),
        null,
    )

    return {
        totalCards: input.cards.length,
        lastInterviewDate,
        technologies,
        vendors,
        initiatives,
        demandSignals,
        projectEnds,
        coverage,
        notes,
        teamSizeLatest,
    }
}
