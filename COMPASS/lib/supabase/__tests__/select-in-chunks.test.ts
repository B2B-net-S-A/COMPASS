import { describe, expect, it, vi } from 'vitest'
import { selectInChunks, requireRows, DEFAULT_IN_CHUNK_SIZE } from '../select-in-chunks'
import { ExpectedError } from '@/lib/actions/expected-error'

// Incydent 2026-08-25: `.in()` z ~400 id → URL ~15 kB ucinany na trasie, pusty
// wynik BEZ błędu. Helper dzieli na paczki i nie pozwala awarii udawać pustki.

interface Row { id: string }

/**
 * Atrapa buildera: zbiera paczki, którymi go zawołano, i oddaje kolejne
 * zaprogramowane odpowiedzi. Naśladuje jednorazowość buildera Supabase —
 * fabryka zwraca świeży obiekt na każdą paczkę.
 */
function fakeSource(responses: Array<{ data: Row[] | null; error: { message: string } | null }>) {
    const chunks: string[][] = []
    let call = 0
    const query = vi.fn(() => ({
        in: (_column: string, values: string[]) => {
            chunks.push(values)
            const res = responses[call++] ?? { data: [], error: null }
            return Promise.resolve(res)
        },
    }))
    return { query, chunks }
}

const ok = (rows: Row[]) => ({ data: rows, error: null })
const idsOf = (n: number, prefix = 'id') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`)

describe('selectInChunks', () => {
    it('nie odpytuje bazy dla pustej tablicy id', async () => {
        const { query } = fakeSource([])
        const out = await selectInChunks<Row>({ source: 't', column: 'id', ids: [], query })
        expect(out).toEqual([])
        expect(query).not.toHaveBeenCalled()
    })

    it('dzieli 201 id na 4 paczki (60/60/60/21)', async () => {
        const { query, chunks } = fakeSource(Array.from({ length: 4 }, () => ok([])))
        await selectInChunks<Row>({ source: 't', column: 'id', ids: idsOf(201), query })
        expect(query).toHaveBeenCalledTimes(4)
        expect(chunks.map((c) => c.length)).toEqual([60, 60, 60, 21])
    })

    it('scala wiersze ze wszystkich paczek zachowując kolejność paczek', async () => {
        const { query } = fakeSource([ok([{ id: 'a' }]), ok([{ id: 'b' }, { id: 'c' }])])
        const out = await selectInChunks<Row>({
            source: 't', column: 'id', ids: idsOf(70), query, chunkSize: 60,
        })
        expect(out).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    })

    it('rzuca gdy druga paczka zwróci błąd i nie odpytuje dalej', async () => {
        const { query } = fakeSource([
            ok([{ id: 'a' }]),
            { data: null, error: { message: 'canceling statement' } },
            ok([{ id: 'z' }]),
        ])
        await expect(
            selectInChunks<Row>({ source: 'client_departures', column: 'id', ids: idsOf(150), query }),
        ).rejects.toThrow(/client_departures.*canceling statement/)
        expect(query).toHaveBeenCalledTimes(2)
    })

    // Sedno incydentu: brak błędu przy braku danych to NIE jest pusta lista.
    it('rzuca gdy paczka zwróci data=null bez błędu', async () => {
        const { query } = fakeSource([{ data: null, error: null }])
        await expect(
            selectInChunks<Row>({ source: 'support_inbox_meta', column: 'ticket_id', ids: ['a'], query }),
        ).rejects.toThrow(/support_inbox_meta.*data=null/)
    })

    it('odduplikowuje id — powtórki tylko wydłużałyby URL', async () => {
        const { query, chunks } = fakeSource([ok([])])
        await selectInChunks<Row>({ source: 't', column: 'id', ids: ['a', 'b', 'a', 'b', 'a'], query })
        expect(query).toHaveBeenCalledTimes(1)
        expect(chunks[0]).toEqual(['a', 'b'])
    })

    it('respektuje własny rozmiar paczki', async () => {
        const { query, chunks } = fakeSource([ok([]), ok([]), ok([])])
        await selectInChunks<Row>({ source: 't', column: 'id', ids: idsOf(5), query, chunkSize: 2 })
        expect(chunks.map((c) => c.length)).toEqual([2, 2, 1])
    })

    it('przekazuje nazwę kolumny do buildera', async () => {
        const inSpy = vi.fn(() => Promise.resolve(ok([])))
        const query = () => ({ in: inSpy })
        await selectInChunks<Row>({ source: 't', column: 'contractor_id', ids: ['a'], query })
        expect(inSpy).toHaveBeenCalledWith('contractor_id', ['a'])
    })

    it('nie zapętla się przy nieprawidłowym rozmiarze paczki', async () => {
        const { query, chunks } = fakeSource([ok([]), ok([])])
        await selectInChunks<Row>({ source: 't', column: 'id', ids: idsOf(2), query, chunkSize: 0 })
        expect(chunks.map((c) => c.length)).toEqual([1, 1])
    })

    it('domyślny rozmiar paczki trzyma URL daleko od progu awarii', () => {
        // 60 × (36 znaków UUID + separator) ≈ 2,5 kB; próg zaobserwowany ~15 kB.
        expect(DEFAULT_IN_CHUNK_SIZE * 40).toBeLessThan(5000)
    })
})

describe('requireRows — awaria NIE jest błędem oczekiwanym', () => {
    // Strona karty kontraktora rozróżnia po TYPIE: `ExpectedError` (brak rekordu)
    // renderuje 404, a zwykły `Error` (awaria odczytu) leci do granicy błędu.
    // Gdyby awaria awansowała na ExpectedError, usterka bazy znów meldowałaby
    // „kontraktor nie istnieje" — twierdzenie o danych zamiast o awarii.
    it('błąd zapytania rzuca zwykły Error, nie ExpectedError', () => {
        const boom = () => requireRows('contractors', { data: null, error: { message: 'timeout' } })
        expect(boom).toThrow(Error)
        expect(boom).not.toThrow(ExpectedError)
    })

    it('data=null bez błędu też rzuca zwykły Error', () => {
        const boom = () => requireRows('contractors', { data: null, error: null })
        expect(boom).toThrow(Error)
        expect(boom).not.toThrow(ExpectedError)
    })
})
