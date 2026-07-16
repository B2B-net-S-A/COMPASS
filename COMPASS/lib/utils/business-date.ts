// Wspólny helper "biznesowego dziś" (audyt People Ops 2026-07-16, P1.3 / §6.7).
//
// Terminy typu DATE (YYYY-MM-DD) porównujemy jako stringi względem daty
// w strefie Europe/Warsaw — NIGDY przez `new Date(dueDate) < new Date()`:
// DATE parsuje się jako północ UTC, więc zadanie z terminem "dziś" stawało się
// przeterminowane już na początku dnia. Kontrakt: "due today" ≠ "overdue".

export const BUSINESS_TIME_ZONE = 'Europe/Warsaw'

/** Stabilne `YYYY-MM-DD` w strefie biznesowej (domyślnie Europe/Warsaw). */
export function businessTodayISO(now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Czy termin DATE jest po terminie względem biznesowego dziś.
 * `dueDate === today` NIE jest overdue; brak terminu nie jest overdue.
 */
export function isDateOverdue(dueDate: string | null | undefined, todayISO: string): boolean {
    if (!dueDate) return false
    return dueDate.slice(0, 10) < todayISO
}
