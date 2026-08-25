// Who was employed during a given month — shared rule for month-scoped views
// and reports (team calendar, payroll export).
//
// Employment is a timeline, not a flag. A view that renders ONE month has to ask
// "did this person work THAT month", not "do they work today". Otherwise you get
// one of two lies: archived people stay on the current view forever (that was
// the calendar bug), or someone who left on the 20th vanishes from a month they
// mostly worked (the same trap in payroll).
//
// Rule: a person drops out starting with the month AFTER their last working day.
//
// `termination_date` is the source of truth; `employment_status='exited'` is only
// the fallback for legacy rows archived before the date was recorded.
// `cancelExitInterview` clears both together, so a re-activated employee comes
// back on their own, with no manual intervention.
//
// NOTE — this is NOT the rule for "right now" lists (messaging recipients,
// assignment dropdowns, notification blasts). Those use the simpler
// `employment_status <> 'exited'`, because they are not scoped to any month.

export interface EmploymentWindowFields {
    employment_status?: string | null
    termination_date?: string | null
}

/**
 * True when the employee was employed during the month starting at `monthStart`
 * (ISO `yyyy-mm-dd`, the 1st of the displayed month).
 *
 * ISO dates compare correctly as strings — no Date/timezone conversion needed.
 */
export function isEmployedInMonth(
    member: EmploymentWindowFields,
    monthStart: string,
): boolean {
    // Last working day known → included through that month, excluded afterwards.
    if (member.termination_date) return member.termination_date >= monthStart

    // No date recorded: only an explicit `exited` removes them (defensive —
    // legacy archives predating termination_date tracking).
    return member.employment_status !== EXITED
}

/** Drop everyone whose employment ended before the given month began. */
export function filterEmployedInMonth<T extends EmploymentWindowFields>(
    members: readonly T[],
    monthStart: string,
): T[] {
    return members.filter((m) => isEmployedInMonth(m, monthStart))
}

/**
 * Pierwszy dzień miesiąca w formacie ISO — kanoniczne wejście dla
 * `isEmployedInMonth` / `filterEmployedInMonth`.
 *
 * Audyt 2026-08: ten szablon był powielany inline w każdym miejscu liczącym
 * okno miesięczne. Jedno źródło zmniejsza szansę, że kolejne wywołanie dostanie
 * datę w innym formacie i porównanie stringów zacznie po cichu kłamać.
 */
export function monthStart(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}-01`
}

// ─────────────────────────────────────────────────────────────────────────────
// DWIE REGUŁY „kto jest na liście" — i dlaczego pomyłka boli w OBIE strony
// ─────────────────────────────────────────────────────────────────────────────
//
// 1) `activeRoster` — listy „TU I TERAZ": adresaci wiadomości, dropdowny
//    przypisania, odbiorcy powiadomień i maili z cronów, katalogi ludzi.
//    Pytanie brzmi „czy ta osoba dziś u nas pracuje".
//
// 2) `employedInMonth` — widoki i raporty MIESIĘCZNE: payroll, kalendarz
//    zespołu, ewidencja. Pytanie brzmi „czy ta osoba pracowała W TYM miesiącu".
//
// Użycie złej reguły boli w obie strony:
//   • reguła miesięczna na liście „tu i teraz" → osoba, która odeszła pół roku
//     temu, zostaje w dropdownie i na kalendarzu na zawsze (tak wyglądał bug
//     kalendarza zespołu);
//   • reguła „tu i teraz" w raporcie miesięcznym → kto odszedł 20-go, znika
//     z rozliczenia miesiąca, który w większości przepracował (ta sama pułapka
//     w payrollu — cichy błąd w wypłacie, nie w widoku).
//
// Rozstrzyga PRZEZNACZENIE wyniku, nie to, z której tabeli pochodzi.

const EXITED = 'exited'
const OFFBOARDING = 'offboarding'

export interface ActiveRosterOptions {
    /**
     * Pomija także osoby w trakcie offboardingu. Domyślnie `false`, bo do
     * ostatniego dnia pracy taka osoba normalnie pracuje i normalnie jest
     * adresatem. Włączane świadomie tam, gdzie lista dotyczy czegoś, co ma
     * przeżyć odejście (np. zakładanie reguł w skrzynce pocztowej).
     */
    excludeOffboarding?: boolean
}

/** Reguła „tu i teraz" dla POJEDYNCZEJ osoby (walidacja pola, guard, warunek w UI). */
export function isActiveNow(
    member: EmploymentWindowFields,
    options: ActiveRosterOptions = {},
): boolean {
    if (member.employment_status === EXITED) return false
    if (options.excludeOffboarding && member.employment_status === OFFBOARDING) return false
    return true
}

/**
 * Lista „tu i teraz" — patrz komentarz wyżej. NIE używaj w raportach
 * miesięcznych; tam jest `employedInMonth`.
 */
export function activeRoster<T extends EmploymentWindowFields>(
    members: readonly T[],
    options: ActiveRosterOptions = {},
): T[] {
    return members.filter((m) => isActiveNow(m, options))
}

/**
 * Ta sama reguła „tu i teraz", ale nałożona po stronie bazy — dla zapytań,
 * które i tak nie pobierają `employment_status` do pamięci.
 *
 * Jedno miejsce z literałem `'exited'` znaczy, że zmiana reguły (np. nowy
 * status „zawieszony") nie wymaga polowania na ~20 rozsypanych `.neq(...)`.
 */
export function excludeExited<
    Q extends { neq(column: 'employment_status', value: string): unknown },
>(query: Q): Q {
    // `neq` w supabase-js zwraca `this`; rzutowanie tylko po to, żeby generyk nie
    // był samozwrotny (rekurencyjne ograniczenie wywalało tsc: TS2589).
    return query.neq('employment_status', EXITED) as Q
}

/**
 * Reguła MIESIĘCZNA — patrz komentarz wyżej. Kanoniczna nazwa, parzysta do
 * `activeRoster`, żeby przy czytaniu kodu od razu było widać, którą z dwóch
 * reguł wybrano.
 */
export const employedInMonth = filterEmployedInMonth
