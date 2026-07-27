// Analityka zejść kontraktorów — czyste funkcje bez I/O.
//
// Wzorzec z lib/consultant-success/health-snapshot.ts: `now` wstrzykiwany parametrem,
// zero zapytań do bazy, dzięki czemu całość jest testowalna bez Supabase.
//
// Daty trzymamy i porównujemy jako stringi 'YYYY-MM-DD' leksykograficznie (tak samo robi
// okno miesięczne w ExitPanel) — porównanie stringów omija pułapki stref czasowych, które
// pojawiają się przy `new Date(...)` na datach bez godziny.

import type { WhoResigned } from '@/lib/types/contractor'

export const WHO_RESIGNED_KEYS = [
    'klient',
    'kandydat',
    'koniec_zamowienia',
    'internalizacja',
    'kandydat_klient',
    'nieznany',
] as const

/** Okresy dostępne w selektorze Analityki. `all` = bez ograniczenia dat. */
export type DeparturePeriod = 'month' | 'quarter' | 'year' | 'last12' | 'all'

export const DEPARTURE_PERIODS: readonly DeparturePeriod[] = ['month', 'quarter', 'year', 'last12', 'all']

export const DEPARTURE_PERIOD_PL: Record<DeparturePeriod, string> = {
    month: 'Ten miesiąc',
    quarter: 'Ten kwartał',
    year: 'Ten rok',
    last12: 'Ostatnie 12 mies.',
    all: 'Wszystko',
}

/** Minimalny kształt wiersza zejścia potrzebny do analityki. */
export interface DepartureAnalyticsRow {
    departure_date: string | null
    who_resigned: WhoResigned | null
    client_name: string
    recruiter_raw: string | null
}

/** Zakres półotwarty [from, to) — `to` jest pierwszym dniem POZA zakresem. */
export interface DateRange {
    from: string
    to: string
}

export interface MonthlyDepartureBucket {
    period: string // YYYY-MM
    klient: number
    kandydat: number
    koniec_zamowienia: number
    internalizacja: number
    kandydat_klient: number
    nieznany: number
    total: number
}

export interface DepartureCount {
    label: string
    count: number
}

export interface DepartureSummary {
    total: number
    withoutDate: number
    byWho: Array<{ who: WhoResigned; count: number }>
    byClient: DepartureCount[]
    byRecruiter: DepartureCount[]
}

/** Etykieta rekrutera dla wierszy z pustym `recruiter_raw`. */
export const NO_RECRUITER_LABEL = '(brak rekrutera)'

function pad2(n: number): string {
    return String(n).padStart(2, '0')
}

const iso = (year: number, month: number, day = 1): string => `${year}-${pad2(month)}-${pad2(day)}`

/** Pierwszy dzień miesiąca przesuniętego o `delta` względem (year, month). */
function shiftMonthStart(year: number, month: number, delta: number): string {
    const idx = year * 12 + (month - 1) + delta
    return iso(Math.floor(idx / 12), (idx % 12) + 1)
}

/**
 * Zakres dat dla wybranego okresu. Zwraca `null` dla `all` (brak ograniczenia).
 * Górna granica jest wyłączna, żeby uniknąć zgadywania długości miesiąca.
 */
export function resolvePeriodRange(period: DeparturePeriod, now: Date = new Date()): DateRange | null {
    if (period === 'all') return null
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    if (period === 'month') {
        return { from: iso(year, month), to: shiftMonthStart(year, month, 1) }
    }
    if (period === 'quarter') {
        const firstMonthOfQuarter = Math.floor((month - 1) / 3) * 3 + 1
        return { from: iso(year, firstMonthOfQuarter), to: shiftMonthStart(year, firstMonthOfQuarter, 3) }
    }
    if (period === 'year') {
        return { from: iso(year, 1), to: iso(year + 1, 1) }
    }
    // last12 — bieżący miesiąc + 11 poprzednich.
    return { from: shiftMonthStart(year, month, -11), to: shiftMonthStart(year, month, 1) }
}

export interface DepartureFilters {
    range?: DateRange | null
    client?: string
    recruiter?: string
}

/** Etykieta rekrutera używana i w filtrze, i w zestawieniu — puste pole → `(brak rekrutera)`. */
export function recruiterLabel(raw: string | null | undefined): string {
    const trimmed = (raw ?? '').trim()
    return trimmed === '' ? NO_RECRUITER_LABEL : trimmed
}

/**
 * Filtr in-memory. Wiersze bez `departure_date` wypadają, gdy podano zakres dat
 * (nie da się ich przypisać do okresu), ale zostają przy `all`.
 */
export function filterDepartures<T extends DepartureAnalyticsRow>(rows: T[], filters: DepartureFilters = {}): T[] {
    const { range, client, recruiter } = filters
    return rows.filter((r) => {
        if (range) {
            if (r.departure_date == null) return false
            if (r.departure_date < range.from || r.departure_date >= range.to) return false
        }
        if (client && r.client_name !== client) return false
        if (recruiter && recruiterLabel(r.recruiter_raw) !== recruiter) return false
        return true
    })
}

/**
 * Seria miesięczna (rosnąco, łącznie z bieżącym miesiącem). Miesiące bez zejść zwracane
 * z zerami, żeby oś czasu była ciągła. Wiersze bez daty są pomijane.
 */
export function buildMonthlyDepartureSeries(
    rows: DepartureAnalyticsRow[],
    monthsBack = 12,
    now: Date = new Date(),
): MonthlyDepartureBucket[] {
    const byPeriod = new Map<string, MonthlyDepartureBucket>()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    for (let offset = monthsBack - 1; offset >= 0; offset--) {
        const period = shiftMonthStart(year, month, -offset).slice(0, 7)
        byPeriod.set(period, {
            period,
            klient: 0,
            kandydat: 0,
            koniec_zamowienia: 0,
            internalizacja: 0,
            kandydat_klient: 0,
            nieznany: 0,
            total: 0,
        })
    }

    for (const row of rows) {
        if (row.departure_date == null) continue
        const bucket = byPeriod.get(row.departure_date.slice(0, 7))
        if (!bucket) continue // poza oknem serii
        const who: WhoResigned = row.who_resigned ?? 'nieznany'
        bucket[who] += 1
        bucket.total += 1
    }

    return Array.from(byPeriod.values())
}

function topCounts(counter: Map<string, number>, limit?: number): DepartureCount[] {
    const rows = Array.from(counter.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pl'))
    return limit == null ? rows : rows.slice(0, limit)
}

/** Zestawienia dla kafli: kto zrezygnował / per klient / per rekruter. */
export function summarizeDepartures(rows: DepartureAnalyticsRow[], topN = 15): DepartureSummary {
    const whoCount = new Map<WhoResigned, number>()
    const clientCount = new Map<string, number>()
    const recruiterCount = new Map<string, number>()
    let withoutDate = 0

    for (const row of rows) {
        if (row.departure_date == null) withoutDate += 1
        const who: WhoResigned = row.who_resigned ?? 'nieznany'
        whoCount.set(who, (whoCount.get(who) ?? 0) + 1)
        clientCount.set(row.client_name, (clientCount.get(row.client_name) ?? 0) + 1)
        const rec = recruiterLabel(row.recruiter_raw)
        recruiterCount.set(rec, (recruiterCount.get(rec) ?? 0) + 1)
    }

    return {
        total: rows.length,
        withoutDate,
        byWho: WHO_RESIGNED_KEYS.filter((who) => (whoCount.get(who) ?? 0) > 0)
            .map((who) => ({ who, count: whoCount.get(who) as number }))
            .sort((a, b) => b.count - a.count),
        byClient: topCounts(clientCount, topN),
        byRecruiter: topCounts(recruiterCount, topN),
    }
}

/**
 * Wynik akcji `getDepartureAnalytics`. `series12m` jest zawsze liczona z ostatnich 12 miesięcy
 * (trend nie zwija się przy zawężeniu okresu); pozostałe pola respektują pełny filtr.
 */
export interface DepartureAnalytics {
    period: DeparturePeriod
    client: string | null
    recruiter: string | null
    /** Trend: ostatnie 12 miesięcy, z filtrem klient/rekruter, bez filtra okresu. */
    series12m: MonthlyDepartureBucket[]
    /** Liczba zejść w wybranym okresie (po wszystkich filtrach). */
    total: number
    /** Liczba wszystkich zejść w bazie — punkt odniesienia dla filtra. */
    totalAllTime: number
    /** Zejścia bez `departure_date` (nie wchodzą do trendu ani do okresów). */
    withoutDate: number
    byWho: Array<{ who: WhoResigned; count: number }>
    byClient: DepartureCount[]
    byRecruiter: DepartureCount[]
    /** Opcje dropdownów — distinct z pełnego zbioru, nie tylko z bieżącego okresu. */
    clients: string[]
    recruiters: string[]
}

export interface DepartureAnalyticsQuery {
    period: DeparturePeriod
    client: string | null
    recruiter: string | null
}

/**
 * Składa cały wynik analityki z surowych wierszy — bez I/O, żeby dało się to przetestować.
 * Trzy różne zbiory, świadomie:
 *  • `filtered`  — pełny filtr (okres + klient + rekruter) → liczby „w okresie",
 *  • `trendRows` — bez filtra okresu → 12-miesięczny trend i licznik braków dat
 *                  (jakość danych to stan globalny, nie właściwość wycinka czasu),
 *  • `rows`      — pełny zbiór → opcje dropdownów i punkt odniesienia `totalAllTime`.
 */
export function buildDepartureAnalytics(
    rows: DepartureAnalyticsRow[],
    query: DepartureAnalyticsQuery,
    now: Date = new Date(),
): DepartureAnalytics {
    const { period, client, recruiter } = query
    const scope = { client: client ?? undefined, recruiter: recruiter ?? undefined }

    const trendRows = filterDepartures(rows, scope)
    const filtered = filterDepartures(rows, { ...scope, range: resolvePeriodRange(period, now) })

    const summary = summarizeDepartures(filtered)
    const options = collectFilterOptions(rows)

    return {
        period,
        client,
        recruiter,
        series12m: buildMonthlyDepartureSeries(trendRows, 12, now),
        total: summary.total,
        totalAllTime: rows.length,
        // Z `filtered` byłoby zawsze 0 dla okresu innego niż „Wszystko" — wiersze bez daty
        // wypadają z każdego zakresu. Kafel ma pokazywać realny stan danych.
        withoutDate: summarizeDepartures(trendRows).withoutDate,
        byWho: summary.byWho,
        byClient: summary.byClient,
        byRecruiter: summary.byRecruiter,
        clients: options.clients,
        recruiters: options.recruiters,
    }
}

/** Posortowane, unikalne wartości do dropdownów filtrów (pełny zbiór, nie tylko okres). */
export function collectFilterOptions(rows: DepartureAnalyticsRow[]): { clients: string[]; recruiters: string[] } {
    const clients = new Set<string>()
    const recruiters = new Set<string>()
    for (const row of rows) {
        if (row.client_name) clients.add(row.client_name)
        recruiters.add(recruiterLabel(row.recruiter_raw))
    }
    const byPl = (a: string, b: string) => a.localeCompare(b, 'pl')
    return {
        clients: Array.from(clients).sort(byPl),
        // "(brak rekrutera)" na końcu listy — to kubeł, nie osoba.
        recruiters: Array.from(recruiters)
            .filter((r) => r !== NO_RECRUITER_LABEL)
            .sort(byPl)
            .concat(recruiters.has(NO_RECRUITER_LABEL) ? [NO_RECRUITER_LABEL] : []),
    }
}
