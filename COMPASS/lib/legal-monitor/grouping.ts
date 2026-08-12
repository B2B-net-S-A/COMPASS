// Phase 51 — Monitoring prawny: skrzynka grupowana po dacie OTRZYMANIA wpisu.
//
// Problem, który to rozwiązuje: przeglądający wchodzi codziennie i szuka „co
// nowego”, a płaska lista nie pokazywała, kiedy wpis do nas trafił. Data w
// wierszu to `published_at` — data DOKUMENTU, która z dnia otrzymania nie wynika
// (w jednym porannym przebiegu potrafią przyjść dokumenty od 2024 do wczoraj),
// więc szukanie nowości po niej jest zgadywanką.
//
// Dniem grupy jest `created_at`, czyli moment dopisania wpisu przez pipeline —
// odpowiednik daty otrzymania w skrzynce mailowej.
//
// Daty liczymy w strefie Europe/Warsaw, nie UTC: serwer chodzi w UTC, więc wpis
// dopisany po 01:00 czasu warszawskiego (lato) inaczej wylądowałby w grupie
// poprzedniego dnia. Import relatywny (jak w health.ts), żeby testy nie zależały
// od aliasu `@/`.

import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { warsawDate } from '../oof/oof-dates'
import { sortItemsForReview } from './health'
import type { LegalMonitorItemRow } from '../types/legal-monitor'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

type GroupableItem = Pick<
    LegalMonitorItemRow,
    'id' | 'severity' | 'published_at' | 'created_at'
>

export interface ReceivedDayGroup<T> {
    /** Dzień otrzymania (YYYY-MM-DD, czas warszawski) — stabilny klucz Reacta. */
    dayISO: string
    /** Nagłówek grupy: „Dzisiaj” / „Wczoraj” / „Przedwczoraj” / „Poniedziałek, 10 sierpnia 2026”. */
    label: string
    /** Dokładna data przy etykietach względnych; null, gdy `label` już nią jest. */
    exactLabel: string | null
    items: T[]
}

/**
 * Dzień otrzymania wpisu (czas warszawski).
 *
 * `created_at` jest w bazie NOT NULL, ale nieparsowalna wartość nie może wywalić
 * całej zakładki — wtedy bierzemy pierwsze 10 znaków, a etykieta zejdzie do
 * „Bez daty”.
 */
export function receivedDayISO(createdAt: string): string {
    const d = new Date(createdAt)
    if (Number.isNaN(d.getTime())) return (createdAt ?? '').slice(0, 10)
    return warsawDate(d)
}

/**
 * Etykieta nagłówka grupy — wzorzec skrzynki mailowej: trzy ostatnie dni
 * słownie, dalej pełna data z dniem tygodnia.
 *
 * UWAGA na format: pełna nazwa miesiąca po liczbie dnia wymaga dopełniacza,
 * więc `MMMM` („10 sierpnia”), NIE `LLLL` („10 sierpień”) — ta sama pułapka co
 * w bannerze stanu monitoringu (Phase 48).
 */
export function dayGroupLabel(dayISO: string, todayISO: string): string {
    if (!ISO_DAY.test(dayISO)) return 'Bez daty'
    if (!ISO_DAY.test(todayISO)) return capitalize(fmtFullDay(dayISO))

    const diff = differenceInCalendarDays(parseISO(dayISO), parseISO(todayISO))
    if (diff === 0) return 'Dzisiaj'
    if (diff === -1) return 'Wczoraj'
    if (diff === -2) return 'Przedwczoraj'
    // Data z przyszłości (rozjazd zegarów) też trafia tutaj — pokazujemy ją
    // wprost, zamiast udawać, że przyszła dzisiaj.
    return capitalize(fmtFullDay(dayISO))
}

/** Dokładna data pod etykietą względną („Dzisiaj · 12 sierpnia 2026”). */
export function exactDayLabel(dayISO: string): string | null {
    if (!ISO_DAY.test(dayISO)) return null
    return format(parseISO(dayISO), 'd MMMM yyyy', { locale: pl })
}

/**
 * Grupuje wpisy po dniu otrzymania: najnowszy dzień na górze, a w obrębie dnia
 * zostaje kolejność skrzynki (pilność → data dokumentu → id). Czerwone nadal są
 * pierwsze w swoim dniu — globalne „wszystkie czerwone na samej górze” zastępuje
 * filtr pilności, który jest w UI od Phase 48.
 */
export function groupItemsByReceivedDay<T extends GroupableItem>(
    items: ReadonlyArray<T>,
    todayISO: string,
): Array<ReceivedDayGroup<T>> {
    const byDay = new Map<string, T[]>()
    for (const item of items) {
        const day = receivedDayISO(item.created_at)
        const bucket = byDay.get(day)
        if (bucket) bucket.push(item)
        else byDay.set(day, [item])
    }

    return Array.from(byDay.entries())
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([dayISO, groupItems]) => {
            const label = dayGroupLabel(dayISO, todayISO)
            const exact = exactDayLabel(dayISO)
            return {
                dayISO,
                label,
                // Przy pełnej dacie w nagłówku druga kopia tej samej daty byłaby szumem.
                exactLabel: exact && exact !== stripWeekday(label) ? exact : null,
                items: sortItemsForReview(groupItems),
            }
        })
}

function fmtFullDay(dayISO: string): string {
    return format(parseISO(dayISO), 'EEEE, d MMMM yyyy', { locale: pl })
}

function stripWeekday(label: string): string {
    const idx = label.indexOf(', ')
    return idx === -1 ? label : label.slice(idx + 2)
}

function capitalize(s: string): string {
    return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
