// Audyt 2026-08 — kadencja przypomnień z zadań cyklicznych.
//
// Problem, który to rozwiązuje (zmierzony na prodzie, nie teoretyczny):
// `contractor-followup-reminder` chodzi codziennie i od 2026-07-28 wysłał 167
// powiadomień — 6 tych samych osób × ~29 dni, o tych samych PIĘCIU rozmowach,
// z których najstarsza czeka od kwietnia. Powiadomienie, które przychodzi
// codziennie i nigdy się nie kończy, przestaje być sygnałem: uczy odruchu
// „odklikaj dzwonek", a razem z nim znikają alerty, które faktycznie były nowe.
//
// Dwie reguły, obie bezstanowe (bez nowej tabeli i bez migracji):
//
// 1) `pickDueRecipients` — kadencja per odbiorca liczona z SAMEJ tabeli
//    `notifications`. Skoro cron i tak zapisuje tam wpis, ten wpis jest już
//    dziennikiem wysyłek; wystarczy go przeczytać przed kolejną wysyłką.
//    Osobna tabela dedupu (wzorzec `timesheet_reminder_log`) jest potrzebna
//    tam, gdzie kanałem jest wyłącznie e-mail i nic nie zostaje w bazie.
//
// 2) `isWeeklyReminderDay` — kadencja dla przypomnień, których jedynym kanałem
//    JEST e-mail (lifecycle). Wybór dnia tygodnia zamiast stempla jest świadomy:
//    stempel wymagałby kolumny, a migracji w tym audycie nie aplikujemy, więc
//    kod nie może od niej zależeć w chwili wdrożenia.
//
// Uwaga na kierunek błędu: obie reguły OGRANICZAJĄ wysyłkę. Zbyt ostra kadencja
// ucisza przypomnienie, więc żadna z nich nie może być jedynym zabezpieczeniem
// przed zgubieniem sprawy — sprawy żyją w kolejkach w UI, a to jest tylko
// szturchnięcie.

import { warsawDate } from '@/lib/oof/oof-dates'

/** Domyślna kadencja szturchnięć o zaległej sprawie: raz w tygodniu. */
export const DEFAULT_REMINDER_CADENCE_DAYS = 7

/**
 * Odbiorcy, do których wolno dziś wysłać przypomnienie danego typu.
 *
 * @param recipients      kandydaci (mogą się powtarzać — wynik jest odsiany)
 * @param lastSentByUser  id odbiorcy → ISO ostatniej wysyłki tego typu (brak = nigdy)
 * @param now             „teraz" wstrzykiwane, żeby test nie zależał od zegara
 * @param cadenceDays     minimalny odstęp między przypomnieniami dla jednej osoby
 */
export function pickDueRecipients(
    recipients: readonly string[],
    lastSentByUser: ReadonlyMap<string, string>,
    now: Date,
    cadenceDays: number = DEFAULT_REMINDER_CADENCE_DAYS,
): string[] {
    const cutoff = now.getTime() - cadenceDays * 86_400_000
    const seen = new Set<string>()
    const due: string[] = []
    for (const id of recipients) {
        if (!id || seen.has(id)) continue
        seen.add(id)
        const last = lastSentByUser.get(id)
        // Zepsuty/pusty stempel traktujemy jak jego brak — lepiej szturchnąć
        // drugi raz niż zamilknąć na zawsze przez jeden nieparsowalny wiersz.
        const lastMs = last ? Date.parse(last) : NaN
        if (Number.isNaN(lastMs) || lastMs <= cutoff) due.push(id)
    }
    return due
}

/**
 * Czy dziś jest dzień tygodniowego przypomnienia (poniedziałek czasu
 * warszawskiego). Serwer chodzi w UTC, więc niedzielny wieczór policzony
 * `getDay()` wypadłby o dobę obok.
 */
export function isWeeklyReminderDay(now: Date): boolean {
    const weekday = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Warsaw',
        weekday: 'short',
    }).format(now)
    return weekday === 'Mon'
}

/**
 * Czy termin `dateIso` mieści się w oknie, w którym jeszcze przypominamy:
 * od `daysBefore` dni przed nim do `daysAfter` dni po nim.
 *
 * Górna granica („do kiedy przypominamy PO terminie") jest tu tym, czego
 * brakowało w lifecycle-reminders: bez niej ankieta zaplanowana w maju
 * generuje maila każdego dnia aż do końca świata. Sprawa nie znika — zostaje
 * w kolejce TCM w UI, przestaje tylko dobijać się mailem.
 *
 * Daty ISO porównują się poprawnie jako stringi — bez konwersji na Date.
 */
export function isWithinReminderWindow(
    dateIso: string | null | undefined,
    todayIso: string,
    { daysBefore, daysAfter }: { daysBefore: number; daysAfter: number },
): boolean {
    if (!dateIso) return false
    const from = shiftIsoDate(todayIso, -daysAfter)
    const to = shiftIsoDate(todayIso, daysBefore)
    return dateIso >= from && dateIso <= to
}

/** Przesunięcie daty ISO o N dni (dodatnie w przód). */
export function shiftIsoDate(dateIso: string, days: number): string {
    const t = Date.parse(`${dateIso}T00:00:00Z`)
    if (Number.isNaN(t)) return dateIso
    return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/** Dzisiejsza data w strefie warszawskiej — wejście dla `isWithinReminderWindow`. */
export function warsawToday(now: Date): string {
    return warsawDate(now)
}

/**
 * Kiedy ostatnio poszło powiadomienie danego typu do każdego z podanych
 * odbiorców. Jedno zapytanie; puste wejście nie odpytuje bazy.
 *
 * Świadomie NIE rzuca przy błędzie odczytu: pusta mapa znaczy „nie wiemy",
 * czyli przypomnienie pójdzie. Odwrotna decyzja (uciszyć przy błędzie) zamienia
 * awarię odczytu w cichy brak powiadomień.
 */
export async function loadLastReminderSentAt(
    // Klient serwisowy Supabase — luźny kontrakt, żeby nie ciągnąć typów bazy
    // (moduł jest importowany z tras cron, które i tak rzutują admina).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    admin: any,
    type: string,
    userIds: readonly string[],
    lookbackDays: number = DEFAULT_REMINDER_CADENCE_DAYS,
    now: Date = new Date(),
): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const ids = Array.from(new Set(userIds.filter(Boolean)))
    if (ids.length === 0) return map

    const since = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString()
    const { data, error } = await admin
        .from('notifications')
        .select('user_id, created_at')
        .eq('type', type)
        .in('user_id', ids)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
    if (error) return map

    for (const row of (data ?? []) as Array<{ user_id: string; created_at: string }>) {
        // Wiersze posortowane malejąco — pierwszy trafiony jest najnowszy.
        if (!map.has(row.user_id)) map.set(row.user_id, row.created_at)
    }
    return map
}
