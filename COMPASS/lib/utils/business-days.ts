import { format, isWeekend, addDays } from 'date-fns'

// Polish public holidays — refresh annually before each new year.
// Ruchome: Wielkanoc (i Poniedziałek Wielkanocny = +1) oraz Boże Ciało (= Wielkanoc +60);
// reszta ma stałą datę. 2026: 5.04 / 4.06 · 2027: 28.03 / 27.05 · 2028: 16.04 / 15.06 ·
// 2029: 1.04 / 31.05 · 2030: 21.04 / 20.06.
// Source: public_holidays table (migracje 20260507120001_phase11b_hr_internal_schema.sql
// + 20260825180000_audit_db1_public_holidays_2028_2030.sql
// + 20260922180000_audit_0922_rls_hardening.sql (Wigilia) — obie listy MUSZĄ mieć te
// same daty; ta jest kopią na potrzeby czystych helperów bez dostępu do bazy).
// TODO(2030-12): Add 2031 entries before 2031-01-01.
const POLISH_HOLIDAYS: ReadonlySet<string> = new Set([
    // 2026
    '2026-01-01',
    '2026-01-06',
    '2026-04-05', // Niedziela Wielkanocna
    '2026-04-06', // Poniedziałek Wielkanocny
    '2026-05-01',
    '2026-05-03',
    '2026-06-04', // Boże Ciało
    '2026-08-15',
    '2026-11-01',
    '2026-11-11',
    '2026-12-24', // Wigilia — ustawowo wolna od 2025 (Dz.U. 2024 poz. 1965)
    '2026-12-25',
    '2026-12-26',
    // 2027
    '2027-01-01',
    '2027-01-06',
    '2027-03-28', // Niedziela Wielkanocna
    '2027-03-29', // Poniedziałek Wielkanocny
    '2027-05-01',
    '2027-05-03',
    '2027-05-27', // Boże Ciało
    '2027-08-15',
    '2027-11-01',
    '2027-11-11',
    '2027-12-24', // Wigilia — ustawowo wolna od 2025 (Dz.U. 2024 poz. 1965)
    '2027-12-25',
    '2027-12-26',
    // 2028
    '2028-01-01',
    '2028-01-06',
    '2028-04-16', // Niedziela Wielkanocna
    '2028-04-17', // Poniedziałek Wielkanocny
    '2028-05-01',
    '2028-05-03',
    '2028-06-15', // Boże Ciało
    '2028-08-15',
    '2028-11-01',
    '2028-11-11',
    '2028-12-24', // Wigilia — ustawowo wolna od 2025 (Dz.U. 2024 poz. 1965)
    '2028-12-25',
    '2028-12-26',
    // 2029
    '2029-01-01',
    '2029-01-06',
    '2029-04-01', // Niedziela Wielkanocna
    '2029-04-02', // Poniedziałek Wielkanocny
    '2029-05-01',
    '2029-05-03',
    '2029-05-31', // Boże Ciało
    '2029-08-15',
    '2029-11-01',
    '2029-11-11',
    '2029-12-24', // Wigilia — ustawowo wolna od 2025 (Dz.U. 2024 poz. 1965)
    '2029-12-25',
    '2029-12-26',
    // 2030
    '2030-01-01',
    '2030-01-06',
    '2030-04-21', // Niedziela Wielkanocna
    '2030-04-22', // Poniedziałek Wielkanocny
    '2030-05-01',
    '2030-05-03',
    '2030-06-20', // Boże Ciało
    '2030-08-15',
    '2030-11-01',
    '2030-11-11',
    '2030-12-24', // Wigilia — ustawowo wolna od 2025 (Dz.U. 2024 poz. 1965)
    '2030-12-25',
    '2030-12-26',
])

/**
 * Audyt 2026-08: data brana z KALENDARZA LOKALNEGO, nie z UTC. `toISOString()`
 * cofał o dobę każdą datę zbudowaną jako lokalna północ (`parseISO('2028-01-06')`
 * na maszynie w Europe/Warsaw = 2028-01-05T23:00Z), przez co święto potrafiło
 * zniknąć. Produkcja chodzi w UTC, więc tam oba warianty dawały to samo — różnica
 * była widoczna wyłącznie lokalnie, czyli tam, gdzie się testuje.
 */
export function isPolishHoliday(date: Date): boolean {
    return POLISH_HOLIDAYS.has(format(date, 'yyyy-MM-dd'))
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
