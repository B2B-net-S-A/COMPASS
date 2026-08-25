// Phase 50 — czysta selekcja alertów monitoringu prawnego (bez I/O, `now` wstrzykiwany).
//
// Cała decyzja „o czym alertować" siedzi tutaj, żeby dała się przetestować bez
// bazy i zegara. I/O (odbiorcy, wysyłka, stemple) jest w alerts.ts — ten sam
// podział co w tech-mapie (alert-selection.ts ↔ alerts.ts).

import { warsawDate } from '../oof/oof-dates'
import type { LegalMonitorRunRow, LegalMonitorSource } from '../types/legal-monitor'

/** Klucze `system_settings` z listą odbiorców (CSV UUID). */
export const RED_RECIPIENTS_KEY = 'legal_monitor_red_recipients'
export const OPS_RECIPIENTS_KEY = 'legal_monitor_ops_recipients'

/**
 * Odbiorcy DZIENNEGO digestu (CSV UUID) — opt-in, ŚWIADOMIE bez fallbacku.
 * Phase 50 wybrał kadencję tygodniową jako domyślną (codzienny mail dla
 * wszystkich to szum); dzienna jest wyłącznie dla jawnie wpisanych osób.
 */
export const DAILY_DIGEST_RECIPIENTS_KEY = 'legal_monitor_daily_digest_recipients'
/** Stempel ostatniej wysyłki dziennego digestu (ISO timestamp) — dedup dobowy + początek okna. */
export const DAILY_DIGEST_LAST_SENT_KEY = 'legal_monitor_daily_digest_last_sent_at'

/**
 * Stempel ostatniego TYGODNIOWEGO digestu (Phase 50 go nie miał).
 *
 * Audyt 2026-08: sekcja tygodniowa wysyłała bezwarunkowo w każdy poniedziałkowy
 * przebieg. Dopóki scheduler jest jeden, wychodzi z tego jeden mail — ale trasa
 * ma trzy drogi do powtórki tego samego dnia: ręczne wywołanie curl-em przy
 * diagnozie, ponowienie zadania w GH Actions i włączenie bliźniaczego zadania
 * w Coolify (`action=cron-enable` włącza WSZYSTKIE naraz — pułapka opisana przy
 * Phase 44/54). Stempel zdejmuje tę pułapkę, więc redundancja schedulerów
 * przestaje kosztować podwójny mail.
 */
export const WEEKLY_DIGEST_LAST_SENT_KEY = 'legal_monitor_weekly_digest_last_sent_at'

/**
 * Ile przebiegów z rzędu musi zgłosić `fail` dla tego samego źródła, zanim
 * wyślemy alert. Pojedyncze `partial` zdarza się rutynowo (api.sejm.gov.pl bywa
 * nieosiągalne — 2 z 3 pierwszych przebiegów na prodzie), a alert o każdym z nich
 * wyrobiłby odruch ignorowania i przykrył ten jeden ważny.
 */
export const SOURCE_FAILURE_STREAK_THRESHOLD = 3

/** Okno digestu — tydzień wstecz. */
export const DIGEST_DAYS = 7

export interface RedAlertCandidate {
    id: string
    severity: string
    status: string
    alerted_at: string | null
}

export interface OverdueCandidate {
    id: string
    status: string
    due_date: string | null
    reminded_at: string | null
    assigned_to: string | null
}

/**
 * Czerwone wpisy do zgłoszenia: nieprzejrzane, jeszcze nie zaalertowane.
 * Po oznaczeniu przez człowieka (status ≠ new) alert jest już bezprzedmiotowy.
 */
export function selectRedAlerts<T extends RedAlertCandidate>(items: ReadonlyArray<T>): T[] {
    return items.filter((i) => i.severity === 'red' && i.status === 'new' && !i.alerted_at)
}

/**
 * Długość serii kolejnych `fail` per źródło, licząc od NAJNOWSZEGO przebiegu.
 * `runs` musi być posortowane malejąco po `run_at`. Seria urywa się na pierwszym
 * przebiegu, w którym źródło nie zgłosiło `fail` (`ok`, `empty` albo brak klucza).
 */
export function sourceFailureStreaks(
    runs: ReadonlyArray<Pick<LegalMonitorRunRow, 'sources_checked'>>,
): Partial<Record<LegalMonitorSource, number>> {
    const streaks: Partial<Record<LegalMonitorSource, number>> = {}
    const closed = new Set<string>()

    for (const run of runs) {
        const sources = (run.sources_checked ?? {}) as Record<string, string>
        const keys = new Set([...Object.keys(sources), ...Object.keys(streaks)])
        for (const key of Array.from(keys)) {
            if (closed.has(key)) continue
            if (sources[key] === 'fail') {
                const source = key as LegalMonitorSource
                streaks[source] = (streaks[source] ?? 0) + 1
            } else if (key in sources) {
                // Źródło odpowiedziało (ok/empty) — seria się urywa.
                closed.add(key)
            }
            // Brak klucza w tym przebiegu: nie przerywamy serii, ale też jej nie
            // wydłużamy — pipeline bywa niekompletny i to nie jest awaria źródła.
        }
    }
    return streaks
}

/**
 * Źródła, które właśnie PRZEKROCZYŁY próg. Warunek `=== threshold` (a nie `>=`)
 * daje dokładnie jeden alert na epizod awarii bez trzymania stanu w bazie:
 * przy serii 4, 5, 6… już nie alertujemy, a po odzyskaniu źródła licznik wraca do zera.
 */
export function sourcesCrossingFailureThreshold(
    runs: ReadonlyArray<Pick<LegalMonitorRunRow, 'sources_checked'>>,
    threshold: number = SOURCE_FAILURE_STREAK_THRESHOLD,
): LegalMonitorSource[] {
    const streaks = sourceFailureStreaks(runs)
    return (Object.entries(streaks) as Array<[LegalMonitorSource, number]>)
        .filter(([, streak]) => streak === threshold)
        .map(([source]) => source)
        .sort()
}

/**
 * Wpisy „do reakcji" po terminie, którym nie przypomnieliśmy jeszcze DZISIAJ.
 * Dedup dobowy po dacie warszawskiej — cron chodzi raz dziennie, ale ręczne
 * wyzwolenie nie ma prawa zdublować przypomnienia.
 */
export function selectOverdueFollowUps<T extends OverdueCandidate>(
    items: ReadonlyArray<T>,
    now: Date,
): T[] {
    const today = warsawDate(now)
    return items.filter((i) => {
        if (i.status !== 'action_required' || !i.due_date) return false
        if (i.due_date > today) return false
        return !i.reminded_at || warsawDate(new Date(i.reminded_at)) < today
    })
}

/** Poniedziałek czasu warszawskiego — wtedy (i tylko wtedy) leci digest tygodniowy. */
export function isDigestDay(now: Date): boolean {
    const weekday = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Warsaw',
        weekday: 'short',
    }).format(now)
    return weekday === 'Mon'
}

/** Początek okna digestu (ISO date, włącznie) — `DIGEST_DAYS` wstecz od dzisiaj. */
export function digestWindowStart(now: Date, days: number = DIGEST_DAYS): string {
    return warsawDate(new Date(now.getTime() - days * 86_400_000))
}

/**
 * Czy dzienny digest ma dziś jeszcze wyjść? Dedup po dacie warszawskiej — cron
 * chodzi raz dziennie, ale ręczne wyzwolenie nie ma prawa zdublować maila.
 * Zepsuty stempel traktujemy jak jego brak (lepiej wysłać, niż zamilknąć na zawsze).
 */
export function shouldSendDailyDigest(lastSentAt: string | null, now: Date): boolean {
    if (!lastSentAt || Number.isNaN(Date.parse(lastSentAt))) return true
    return warsawDate(new Date(lastSentAt)) < warsawDate(now)
}

/**
 * Czy tygodniowy digest ma dziś jeszcze wyjść? Ta sama reguła co przy dziennym
 * (dedup po dacie warszawskiej) — o „raz w tygodniu" decyduje `isDigestDay`,
 * ten stempel pilnuje tylko, żeby drugi przebieg tego samego poniedziałku nie
 * wysłał maila po raz drugi. Zepsuty stempel = brak stempla (lepiej wysłać niż
 * zamilknąć na tydzień).
 */
export function shouldSendWeeklyDigest(lastSentAt: string | null, now: Date): boolean {
    return shouldSendDailyDigest(lastSentAt, now)
}

/**
 * Początek okna dziennego digestu = poprzedni stempel (pełny ISO timestamp, nie
 * data — kolejne okna muszą sklejać się bez szpar i bez powtórek). Stempel rośnie
 * tylko przy realnej wysyłce, więc po cichych dniach (weekend — pipeline chodzi
 * pn–pt) okno samo się wydłuża i żaden wpis nie ginie. Bez stempla: doba wstecz.
 */
export function dailyDigestWindowStart(lastSentAt: string | null, now: Date): string {
    if (lastSentAt && !Number.isNaN(Date.parse(lastSentAt))) return lastSentAt
    return new Date(now.getTime() - 86_400_000).toISOString()
}
