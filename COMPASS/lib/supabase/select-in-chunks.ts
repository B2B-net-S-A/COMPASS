// ─── Zapytanie `.in()` paczkami ──────────────────────────────────────────────
// Incydent 2026-08-25 („zniknął nam cały kanban"). `.in()` z 397 identyfikatorami
// budowało query string ~15 kB, ucinany na trasie do kontenera. Zapytanie nie
// wracało z błędem — wracało z pustką, a `rows.length === 0 → return []` po stronie
// wywołującego zamieniało awarię w pusty ekran, bez słowa komunikatu.
//
// Ten helper odbiera wywołującemu obie okazje do pomyłki naraz:
// - dzieli identyfikatory na paczki (URL ~2,5 kB zamiast ~15 kB),
// - rzuca przy `error` ORAZ przy `data === null` — null bez błędu NIE jest pustą
//   listą, tylko sygnałem, że odpowiedź nie zmaterializowała się w runtime.
//
// Rzucamy zwykłym `Error`, nie `ExpectedError`: to awaria infrastruktury, która ma
// trafić do Sentry, a nie reguła biznesowa do pokazania użytkownikowi.
//
// UWAGA PRZY SORTOWANIU: `.order()` działa w obrębie POJEDYNCZEJ paczki, a scalony
// wynik nie ma gwarancji globalnej kolejności. Jest to bezpieczne dopóki klucz
// grupowania u wywołującego = kolumna, po której dzielimy — wszystkie wiersze danego
// id trafiają wtedy do jednej paczki, więc „pierwszy wiersz per id" pozostaje
// pierwszy. Do globalnego „pierwszych N wierszy" ta funkcja się NIE nadaje.
//
// Czysty moduł (bez zależności serwerowych) — testowalny wprost.

/** Kształt odpowiedzi listowej PostgREST, w części, która nas obchodzi. */
export interface RowsResponse<T> {
    data: T[] | null
    error: { message: string } | null
}

/**
 * Rozpakowuje wynik zapytania listowego, którego wiersze są TREŚCIĄ ekranu.
 *
 * Używać wszędzie tam, gdzie pusta lista jest renderowana jako „nic nie ma" —
 * bez tego awaria zapytania nie do odróżnienia od braku danych. Do zapytań
 * czysto DEKORACYJNYCH (nazwiska, etykiety) NIE używać: tam awaria ma degradować
 * wyświetlanie, a nie zamieniać działający ekran w komunikat o błędzie.
 */
export function requireRows<T>(source: string, res: RowsResponse<T>): T[] {
    if (res.error) throw new Error(`Nie udało się pobrać ${source}: ${res.error.message}`)
    // null bez błędu ≠ pusta lista — sygnał, że odpowiedź nie zmaterializowała się.
    if (res.data === null) throw new Error(`Brak odpowiedzi z ${source} (data=null bez błędu)`)
    return res.data
}

/** 60 UUID-ów to ~2,5 kB query stringu — z dużym zapasem pod progiem awarii (~15 kB). */
export const DEFAULT_IN_CHUNK_SIZE = 60

/**
 * Minimalny kształt buildera Supabase, jakiego tu potrzebujemy: `.in()` zwracające
 * coś oczekiwalnego. Spełnia go `PostgrestFilterBuilder`.
 *
 * Wynik jest celowo `unknown`, a typ wiersza podaje wywołujący parametrem `T`.
 * Wersja z `PromiseLike<RowsResponse<T>>` zmuszała TypeScript do porównywania
 * sygnatury `then` buildera z pełnym typem `Database` — kontrawariantnie i przy
 * każdym wywołaniu — co kończyło się „Type instantiation is excessively deep".
 * Przy okazji znikają rozjazdy na kolumnach pilnowanych CHECK-iem (generują się
 * jako `string`/`Json`, nie jako nasze unie).
 */
export interface ChunkableBuilder {
    in(column: string, values: string[]): PromiseLike<unknown>
}

/**
 * To, czego wymagamy OD WYWOŁUJĄCEGO — celowo słabsze niż `ChunkableBuilder`.
 *
 * Sprawdzanie pełnej sygnatury `in` zmuszało kompilator do porównania jej z
 * generyczną metodą buildera PostgREST przy każdym wywołaniu; przy dłuższym
 * łańcuchu na kliencie użytkownika budżet instancjacji się wyczerpywał i tsc
 * padał z TS2589 (ta sama pułapka, co w `excludeExited`). Obecność pola wystarczy,
 * żeby odrzucić oczywiste pomyłki, a wywołanie idzie przez `ChunkableBuilder`.
 */
export interface ChunkableBuilderInput {
    in: unknown
}

export interface SelectInChunksOptions {
    /** Nazwa tabeli/źródła — trafia do komunikatu błędu, żeby dało się go umiejscowić. */
    source: string
    /** Kolumna filtrowana przez `.in()`. */
    column: string
    ids: readonly string[]
    /**
     * Fabryka buildera BEZ `.in()` — filtr paczki dokłada helper. Fabryka, a nie
     * gotowy builder, bo builder Supabase jest jednorazowy (thenable): każda paczka
     * potrzebuje świeżej instancji.
     */
    query: () => ChunkableBuilderInput
    chunkSize?: number
}

/**
 * Pobiera wiersze pasujące do `ids` paczkami i scala wynik.
 *
 * Identyfikatory są odduplikowane — powtórka tylko wydłużałaby URL, a wynik
 * PostgREST i tak jest zbiorem.
 */
export async function selectInChunks<T>({
    source,
    column,
    ids,
    query,
    chunkSize = DEFAULT_IN_CHUNK_SIZE,
}: SelectInChunksOptions): Promise<T[]> {
    const unique = Array.from(new Set(ids))
    if (unique.length === 0) return []

    // Zabezpieczenie przed nieskończoną pętlą, gdyby ktoś podał 0 lub liczbę ujemną.
    const size = Math.max(1, Math.floor(chunkSize))
    const out: T[] = []

    for (let i = 0; i < unique.length; i += size) {
        const builder = query() as unknown as ChunkableBuilder
        const res = (await builder.in(column, unique.slice(i, i + size))) as RowsResponse<T>
        out.push(...requireRows(source, res))
    }

    return out
}
