// Audyt 2026-08 (B1.0) — wydzielone z action-result.ts, żeby moduły, które
// tylko RZUCAJĄ ten błąd (guardy, walidatory), nie musiały ciągnąć Sentry
// ani `server-only`.

/**
 * Błąd, którego treść MA zobaczyć użytkownik: nieprzeszła walidacja,
 * odmowa uprawnień, wygasła sesja, naruszenie reguły biznesowej.
 *
 * NIE trafia do Sentry — to normalny przebieg programu, nie awaria.
 *
 * Rozstrzygnięcie z przeglądu: **guardy autoryzacyjne rzucają właśnie to**.
 * Pierwsza wersja kontraktu kazała im iść do Sentry, ale to znaczyłoby, że
 * najczęstszy przypadek w całej rodzinie — WYGASŁA SESJA — mówi użytkownikowi
 * „Coś poszło nie tak po naszej stronie" zamiast „zaloguj się ponownie",
 * a Sentry dostaje zdarzenie przy każdym wygaśnięciu ciasteczka.
 */
export class ExpectedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ExpectedError'
    }
}

/** Wygasła lub brakująca sesja — użytkownik ma się po prostu zalogować. */
export const SESSION_EXPIRED_PL =
    'Twoja sesja wygasła. Zaloguj się ponownie, żeby kontynuować.'

export class SessionExpiredError extends ExpectedError {
    constructor() {
        super(SESSION_EXPIRED_PL)
        this.name = 'SessionExpiredError'
    }
}
