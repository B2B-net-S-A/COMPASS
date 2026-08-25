/**
 * Authentication & rate-limiting constants.
 *
 * Wynoszone do osobnego pliku (Phase 18.8) żeby:
 *  - Wartości były editable bez touchowania logic.
 *  - Mogły być importowane w testach + UI message ("zostało X prób").
 *  - Future: można je przenieść do env vars jeśli operations chce strojić.
 */

/** Max failed login attempts per email within WINDOW_MINUTES before lockout. */
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5

/** Window length (minutes) for counting failed login attempts. */
export const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 15

/**
 * Komunikat po przekroczeniu limitu prób logowania.
 *
 * Celowo NIE zdradza, czy konto istnieje, ani ile prób zostało — inaczej
 * formularz logowania staje się wyroczną do enumeracji adresów e-mail.
 */
export const RATE_LIMIT_MESSAGE_PL =
    `Zbyt wiele nieudanych prób logowania. Odczekaj ${LOGIN_RATE_LIMIT_WINDOW_MINUTES} minut i spróbuj ponownie.`

/** MFA code validity window (minutes) — kod ważny przez 5 min od wygenerowania. */
export const MFA_CODE_VALIDITY_MINUTES = 5

/** MFA code length (digits). */
export const MFA_CODE_DIGITS = 6
