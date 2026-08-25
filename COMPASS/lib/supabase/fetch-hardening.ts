// ─── Utwardzony fetch dla serwerowych klientów Supabase ──────────────────────
// Incydent 2026-08-25 („zniknął nam cały kanban"). Uwaga na kolejność faktów,
// bo pierwsza diagnoza była błędna:
//
// - PRZYCZYNĄ incydentu okazała się DŁUGOŚĆ URL-a zapytania (`.in()` z 397 id
//   → query string ~15 kB, ucinany na trasie do kontenera). Naprawa siedzi
//   w listInboxTickets (pytanie paczkami), NIE tutaj.
// - Ten moduł powstał wcześniej, gdy podejrzenie padało na rozmiar odpowiedzi.
//   Zostaje, bo rozwiązuje realny, osobny problem: Next.js Data Cache potrafił
//   zapamiętać nieudany rezultat dla URL-a i odtwarzać go przy KOLEJNYCH
//   renderach bez dotykania sieci (rendery z błędem, dla których w edge logach
//   nie było ani jednego zapytania) — świeży kontener psuł się po pierwszym
//   nieudanym fetchu i już taki zostawał.
//
// Dwie rzeczy, które ten moduł faktycznie daje:
// - `cache: 'no-store'` — zapytania uwierzytelnione per-user NIGDY nie mogą być
//   cache'owane współdzielonym Data Cache (klucz cache to URL bez nagłówków,
//   więc wpis jednego użytkownika serwowałby dane innym); wymuszamy jawnie
//   zamiast polegać na heurystykach Next.js.
// - retry z krótkim backoffem na SIECIOWE błędy żądań idempotentnych (GET/HEAD)
//   — undici po padzie niszczy socket, więc ponowienie idzie po świeżym
//   połączeniu. Mutacje (POST/PATCH/DELETE) świadomie BEZ retry (podwójny
//   insert gorszy niż widoczny błąd). Uwaga: retry NIE ratuje żądania z za
//   długim URL-em (każda próba pada tak samo — potwierdzone w produkcji);
//   od tego jest pytanie paczkami po stronie wywołującego.
//
// Czysty moduł (bez zależności serwerowych) — testowalny wprost.

const RETRY_DELAYS_MS = [150, 400]

function isIdempotent(method: string): boolean {
    return method === 'GET' || method === 'HEAD'
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method.toUpperCase()
    if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
    return 'GET'
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Fetch z wymuszonym `no-store` i ponowieniami sieciowych błędów GET/HEAD.
 * Ponawiamy WYŁĄCZNIE odrzucenia fetch (TypeError „fetch failed", zerwany
 * transfer) — odpowiedzi HTTP (także 4xx/5xx) wracają bez retry, bo to
 * odpowiedzialność warstwy wyżej (PostgREST komunikuje nimi błędy zapytań).
 */
export async function hardenedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    fetchImpl: typeof fetch = fetch,
): Promise<Response> {
    const patchedInit: RequestInit = { ...init, cache: 'no-store' }
    const method = resolveMethod(input, init)
    const attempts = isIdempotent(method) ? RETRY_DELAYS_MS.length + 1 : 1

    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1])
        try {
            return await fetchImpl(input, patchedInit)
        } catch (error) {
            lastError = error
        }
    }
    throw lastError
}
