// Czy konto ma jeszcze prawo wejść do COMPASS-a.
//
// Do 2026-07 archiwizacja pracownika była wyłącznie kosmetyką po stronie UI —
// nigdzie w middleware ani w guardach nie sprawdzaliśmy `employment_status`,
// więc konto osoby, która odeszła, dalej przechodziło autoryzację. Broniło nas
// tylko wyłączenie konta w M365 (logowanie idzie przez SSO), a to jest cudza
// procedura, poza COMPASS-em, i nie dotyczy kont na hasło (konsultanci spoza
// domeny). Ten moduł jest jedynym miejscem, które definiuje regułę — trzy
// punkty egzekucji (middleware, callback SSO, logowanie hasłem) importują ją
// stąd, żeby nie mogły się rozjechać.
//
// ŚWIADOMIE `exited`, NIE `termination_date < dziś`:
// blokuje jawny akt archiwizacji, a nie sama data. Powody:
//   1. offboarding trwa po ostatnim dniu pracy — pracownik ma jeszcze wypełnić
//      exit interview, a data zejścia bywa wpisana z wyprzedzeniem,
//   2. literówka w dacie zamykałaby dostęp żywemu pracownikowi, a odblokować
//      może wtedy tylko admin,
//   3. „zarchiwizowany" to stan, który ktoś świadomie nadał — i tylko on ma
//      odbierać dostęp.
// `offboarding` NIE blokuje: do ostatniego dnia człowiek normalnie pracuje.

/** Kod błędu w URL-u `/login?error=...` po odrzuceniu zarchiwizowanego konta. */
export const ARCHIVED_ACCOUNT_ERROR_CODE = 'account_archived'

/** Komunikat pokazywany takiej osobie — bez sugerowania, że to awaria. */
export const ARCHIVED_ACCOUNT_MESSAGE_PL =
    'To konto jest nieaktywne — dostęp do COMPASS-a został zakończony. ' +
    'Jeśli to pomyłka, skontaktuj się z działem HR.'

/** True, gdy profil został zarchiwizowany i nie może już wejść do aplikacji. */
export function isArchivedAccount(employmentStatus?: string | null): boolean {
    return employmentStatus === 'exited'
}
