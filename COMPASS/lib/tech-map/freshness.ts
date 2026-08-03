// Phase 46 — świeżość danych mapy technologicznej (czysta, bez I/O).
// Dane starsze niż STALE_MONTHS pokazujemy wyblakłe z etykietą „do odświeżenia";
// KPI (Etap 3) liczy pokrycie danymi młodszymi niż FRESH_KPI_DAYS.

/** Próg wizualnego wyblaknięcia na karcie klienta (miesiące). */
export const STALE_MONTHS = 6

/** Próg „świeżych danych" w KPI pokrycia obszarów (dni). */
export const FRESH_KPI_DAYS = 90

const MS_PER_DAY = 86_400_000

function toUtcMs(isoDate: string): number {
    const year = Number.parseInt(isoDate.slice(0, 4), 10)
    const month = Number.parseInt(isoDate.slice(5, 7), 10)
    const day = Number.parseInt(isoDate.slice(8, 10), 10)
    return Date.UTC(year, month - 1, day)
}

/** Pełne dni między dwiema datami ISO (to − from); ujemne gdy from > to. */
export function daysBetween(fromISO: string, toISO: string): number {
    return Math.floor((toUtcMs(toISO) - toUtcMs(fromISO)) / MS_PER_DAY)
}

/**
 * Czy dane są przeterminowane (starsze niż `staleMonths` miesięcy kalendarzowych).
 * `null` (brak jakiegokolwiek wpisu) traktujemy jako przeterminowane.
 */
export function isStale(
    lastDateISO: string | null,
    todayISO: string,
    staleMonths: number = STALE_MONTHS,
): boolean {
    if (!lastDateISO) return true
    const year = Number.parseInt(lastDateISO.slice(0, 4), 10)
    const month = Number.parseInt(lastDateISO.slice(5, 7), 10)
    const day = Number.parseInt(lastDateISO.slice(8, 10), 10)
    // Data graniczna = lastDate + staleMonths miesięcy (Date.UTC normalizuje przepełnienia).
    const threshold = new Date(Date.UTC(year, month - 1 + staleMonths, day))
    return toUtcMs(todayISO) > threshold.getTime()
}

/** Czy wpis mieści się w oknie świeżości KPI (< freshDays dni). */
export function isFresh(
    lastDateISO: string | null,
    todayISO: string,
    freshDays: number = FRESH_KPI_DAYS,
): boolean {
    if (!lastDateISO) return false
    const diff = daysBetween(lastDateISO, todayISO)
    return diff >= 0 ? diff < freshDays : true
}
