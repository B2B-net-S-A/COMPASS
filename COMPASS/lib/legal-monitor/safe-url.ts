// Phase 48 — walidacja linku źródła przed renderem.
//
// `legal_monitor_items.url` pisze pipeline AI czytający publiczne strony, więc to
// treść z zewnątrz — dane, nie zaufane wejście. React renderuje `href` bez
// sanityzacji, a `javascript:` w linku wykonałby się w sesji użytkownika finanse/
// admin (czyli kogoś z prawem zapisu do danych HR). Dopuszczamy wyłącznie http(s).
//
// Parsujemy przez `URL`, a nie regexem: konstruktor obcina wiodące białe znaki i
// normalizuje wielkość liter schematu, więc warianty w rodzaju „ JaVaScRiPt:…"
// też trafiają na sprawdzenie protokołu.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Zwraca znormalizowany URL, gdy jest bezpieczny do renderowania jako link;
 * `null` dla pustych, niepoprawnych i nie-http(s) adresów.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
    if (!raw) return null
    let parsed: URL
    try {
        parsed = new URL(raw.trim())
    } catch {
        // Adres względny lub śmieć — nie zgadujemy, czym miał być.
        return null
    }
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? parsed.href : null
}
