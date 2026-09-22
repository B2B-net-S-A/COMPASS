export function sessionDate(value: string, timeZone = 'Europe/Warsaw'): string {
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(value))
}

export function sessionTime(value: string, timeZone = 'Europe/Warsaw'): string {
    return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(value))
}

export function localDateTime(value: string, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
    const part = (type: string) => parts.find((item) => item.type === type)?.value
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

/** Resolve a wall-clock time explicitly; reject DST gaps/overlaps rather than silently moving a meeting. */
export function zonedDateTimeToIso(value: string, timeZone: string): string {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Uzupełnij poprawną datę i godzinę.')
    const wallClock = Date.parse(`${value}:00Z`)
    if (!Number.isFinite(wallClock)) throw new Error('Data lub godzina jest nieprawidłowa.')
    const candidates = new Set<string>()
    for (let hour = -36; hour <= 36; hour += 6) {
        const sample = wallClock + hour * 60 * 60 * 1000
        const offset = Date.parse(`${localDateTime(new Date(sample).toISOString(), timeZone)}:00Z`) - sample
        const candidate = new Date(wallClock - offset).toISOString()
        if (localDateTime(candidate, timeZone) === value) candidates.add(candidate)
    }
    if (!candidates.size) throw new Error('Ta godzina nie istnieje w wybranej strefie z powodu zmiany czasu. Wybierz inną godzinę.')
    if (candidates.size > 1) throw new Error('Ta godzina występuje dwukrotnie przy zmianie czasu. Wybierz strefę UTC i podaj jednoznaczny czas spotkania.')
    return Array.from(candidates)[0]
}

export const RUN_STATUS_LABEL = { draft: 'Szkic edycji', published: 'Zapisy otwarte', cancelled: 'Edycja odwołana' }
export const REGISTRATION_LABEL = { confirmed: 'Zapis potwierdzony', waitlisted: 'Lista rezerwowa', cancelled: 'Zapis anulowany' }
export const SESSION_SYNC_LABEL = { draft: 'Nieopublikowane', pending: 'Przygotowanie spotkania', ready: 'Spotkanie gotowe', error: 'Spotkanie wymaga uwagi', cancelled: 'Spotkanie odwołane' }
export const ATTENDANCE_LABEL = { present: 'Obecność potwierdzona', insufficient: 'Niewystarczająca obecność', needs_review: 'Do weryfikacji' }
export const SESSION_SELECT_CLASS = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
