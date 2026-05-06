import { isWeekend, addDays } from 'date-fns'

// Polish public holidays — refresh annually before each new year.
// 2026: Nowy Rok, Trzech Króli, Wielkanoc Pn, 1.05, 3.05, Boże Ciało, 15.08, 1.11, 11.11, 25-26.12.
// TODO(2026-12): Add 2027 entries before 2027-01-01.
const POLISH_HOLIDAYS: ReadonlySet<string> = new Set([
    '2026-01-01',
    '2026-01-06',
    '2026-04-06',
    '2026-05-01',
    '2026-05-03',
    '2026-06-04',
    '2026-08-15',
    '2026-11-01',
    '2026-11-11',
    '2026-12-25',
    '2026-12-26',
])

export function isPolishHoliday(date: Date): boolean {
    return POLISH_HOLIDAYS.has(date.toISOString().slice(0, 10))
}

/**
 * Adds N Polish business days to a date — skips weekends and holidays.
 * `date-fns/addBusinessDays` only skips weekends, so we wrap it.
 */
export function addPolishBusinessDays(start: Date, days: number): Date {
    if (days < 0) throw new Error('addPolishBusinessDays: days must be >= 0')
    let result = new Date(start)
    let added = 0
    while (added < days) {
        result = addDays(result, 1)
        if (!isWeekend(result) && !isPolishHoliday(result)) {
            added++
        }
    }
    return result
}
