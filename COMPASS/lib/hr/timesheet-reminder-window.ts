// Phase 51 — jedno przypomnienie o timesheecie na miesiąc.
//
// Do sierpnia 2026 przypomnienia szły w eskalacji Harvest-style: „mon-nudge" w KAŻDY
// poniedziałek i „wed-warning" w KAŻDĄ środę (zadania Coolify `0 9 * * 1` i `0 9 * * 3`),
// oba za miesiąc BIEŻĄCY — czyli jeszcze niezamknięty. Kto nie złożył timesheetu,
// dostawał ~8 maili miesięcznie, a treść mijała się z prawdą: 12 sierpnia mail pisał
// „termin za 3 dni" o timesheecie za sierpień, którego termin przypada 5 września.
//
// Ten moduł jest jedynym źródłem prawdy o tym, KIEDY przypomnienie ma sens: po
// zamknięciu miesiąca i przed terminem. Czyste funkcje na datach kalendarzowych
// (YYYY-MM-DD w czasie warszawskim, wstrzykiwanych przez wołającego), żeby granice
// dało się testować bez zegara.

/** Termin złożenia timesheetu: 5. dzień miesiąca następującego po rozliczanym. */
export const TIMESHEET_DEADLINE_DAY = 5

export interface TimesheetPeriod {
    year: number
    /** 1-12 */
    month: number
}

function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
    if (!m) throw new Error(`Nieprawidłowa data kalendarzowa: ${isoDate}`)
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/**
 * Miesiąc zamknięty przed podanym dniem — ten, za który przypominamy.
 *
 * Zawsze POPRZEDNI, nigdy bieżący: o timesheet za miesiąc, który jeszcze trwa, nie ma
 * o co prosić (nie da się rozliczyć dni, które się nie wydarzyły), a właśnie to robiła
 * poprzednia wersja crona.
 */
export function closedMonthFor(todayIso: string): TimesheetPeriod {
    const { year, month } = parseIsoDate(todayIso)
    return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/**
 * Okno przypomnień: 1.–5. dzień miesiąca, czyli od zamknięcia miesiąca do dnia terminu
 * włącznie. Poza oknem cron nie wysyła nic — także wtedy, gdy zawoła go stare zadanie
 * z `?phase=...`, bo to trasa decyduje o wysyłce, nie wołający.
 *
 * Okno, a nie jeden konkretny dzień, bo scheduler bywa zawodny (crony Coolify potrafiły
 * nie odpalać tygodniami — patrz Phase 41b). Za to, żeby z pięciu prób wyszedł dokładnie
 * jeden mail, odpowiada dedup w `timesheet_reminder_log`.
 */
export function isWithinReminderWindow(todayIso: string): boolean {
    return parseIsoDate(todayIso).day <= TIMESHEET_DEADLINE_DAY
}

/** Termin złożenia timesheetu za dany okres (YYYY-MM-DD). */
export function submissionDeadlineIso(period: TimesheetPeriod): string {
    const rollsOver = period.month === 12
    const year = rollsOver ? period.year + 1 : period.year
    const month = rollsOver ? 1 : period.month + 1
    return `${year}-${String(month).padStart(2, '0')}-${String(TIMESHEET_DEADLINE_DAY).padStart(2, '0')}`
}

/** Pierwszy dzień okresu (YYYY-MM-DD) — do formatowania nazwy miesiąca po polsku. */
export function periodStartIso(period: TimesheetPeriod): string {
    return `${period.year}-${String(period.month).padStart(2, '0')}-01`
}

/** Etykieta okresu w mailu, alercie Teams i logach: `2026-08`. */
export function periodLabel(period: TimesheetPeriod): string {
    return `${period.year}-${String(period.month).padStart(2, '0')}`
}
