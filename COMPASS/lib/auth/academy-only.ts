// Izolacja konta nauki (Akademia, B1.4). Moduł bez `server-only` i bez klienta Supabase,
// bo czyta go też middleware na edge.
//
// Znacznikiem w aplikacji jest `app_metadata.academy_only`. To pole ustawia wyłącznie
// Admin API i nie zmieni go klient (`auth.updateUser` pisze tylko `user_metadata`), a
// `auth.getUser()` i tak zwraca je w każdym żądaniu, więc nie płacimy dodatkowym
// zapytaniem i kod działa, zanim w bazie powstanie `profiles.academy_only`.
// Kolumna (B1.2) jest wyprowadzana z tego samego znacznika i służy politykom RLS.

export const ACADEMY_ONLY_DENIED_MESSAGE = 'Ta funkcja jest niedostępna na koncie Akademii.'
export const ACADEMY_ONLY_HOME = '/learning'

/** Biała lista ścieżek konta nauki. Akcje i trasy API mają własną odmowę, bo POST idzie obok niej. */
const ACADEMY_ONLY_PATHS = ['/learning', '/notifications']
/** Autorstwo szkoleń nie jest przeznaczone dla konta nauki, mimo że leży pod `/learning`. */
const ACADEMY_ONLY_BLOCKED_PATHS = ['/learning/tworze']

function matchesPath(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isAcademyOnlyUser(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
    return user?.app_metadata?.academy_only === true
}

export function isAcademyOnlyPathAllowed(pathname: string): boolean {
    if (ACADEMY_ONLY_BLOCKED_PATHS.some(prefix => matchesPath(pathname, prefix))) return false
    return ACADEMY_ONLY_PATHS.some(prefix => matchesPath(pathname, prefix))
}
