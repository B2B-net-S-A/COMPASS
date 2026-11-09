// Kurs z modułów dla nieobecnych (B4.8, makieta M09). Czysty moduł, bez zależności serwerowych.

import { reportDate } from '@/lib/academy/competence-report'

/**
 * Zdanie o terminie szkolenia na żywo do banera kursu z modułów. Dzień liczony w Europe/Warsaw.
 * Bez czytelnej daty (brak sesji, RLS nie pokazał edycji) zwraca null, a baner zostaje bez daty.
 */
export function liveTrainingDateSentence(sessionStarts: string[]): string | null {
    const days = Array.from(new Set(sessionStarts
        .map(start => Date.parse(start))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
        .map(time => reportDate(new Date(time).toISOString()))))
    if (days.length === 0) return null
    return days.length === 1
        ? `Szkolenie na żywo odbyło się ${days[0]}.`
        : `Szkolenie na żywo odbyło się od ${days[0]} do ${days[days.length - 1]}.`
}
