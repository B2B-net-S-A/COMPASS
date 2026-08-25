// ─── Utwardzony fetch dla serwerowych klientów Supabase ──────────────────────
// Incydent 2026-08-25 („zniknął nam cały kanban"): dwie współdziałające awarie
// sprawiały, że tablica Zgłoszeń renderowała się pusta mimo zdrowego API:
//
// 1. Transfer dużych odpowiedzi PostgREST do kontenera bywał zrywany w locie
//    (edge logował 200 + pełny content-range, a fetch w kontenerze padał).
// 2. Next.js Data Cache potrafił zapamiętać taki zepsuty rezultat dla URL-a
//    zapytania i odtwarzać go przy KOLEJNYCH renderach bez dotykania sieci —
//    świeży kontener psuł się po pierwszym nieudanym fetchu i już takim zostawał.
//
// Ten moduł adresuje obie warstwy:
// - `cache: 'no-store'` — zapytania uwierzytelnione per-user NIGDY nie mogą być
//   cache'owane współdzielonym Data Cache (klucz cache to URL bez nagłówków,
//   więc wpis jednego użytkownika serwowałby dane innym); wymuszamy jawnie
//   zamiast polegać na heurystykach Next.js.
// - retry z krótkim backoffem na SIECIOWE błędy żądań idempotentnych (GET/HEAD)
//   — undici po padzie niszczy socket, więc ponowienie idzie po świeżym
//   połączeniu. Mutacje (POST/PATCH/DELETE) świadomie BEZ retry (podwójny
//   insert gorszy niż widoczny błąd).
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
