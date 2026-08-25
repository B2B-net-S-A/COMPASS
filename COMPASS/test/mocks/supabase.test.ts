import { describe, expect, it } from 'vitest'

import { createMockSupabaseClient } from './supabase'

/**
 * Atrapa Supabase jest fundamentem ~40 plików testowych — jeśli kłamie, kłamią
 * wszystkie. Ten plik pilnuje semantyki `upsert`, bo do audytu 2026-08 była ona
 * po prostu `insert`: `onConflict` i `ignoreDuplicates` szły do kosza, więc
 * KAŻDY wiersz „wchodził". Gwarancje oparte o ON CONFLICT — rezerwacja
 * „jeden mail na miesiąc" (timesheet-reminder), idempotencja importów po
 * `external_key`, dedup alertów — wypadały w testach zawsze na zielono,
 * niezależnie od tego, co robił kod.
 */
describe('mock Supabase — upsert z ON CONFLICT', () => {
    it('ignoreDuplicates: kolizja NIE wraca z .select() — to sygnał „ktoś mnie ubiegł"', async () => {
        const db = createMockSupabaseClient({
            tables: { reminders: [{ user_id: 'u1', year: 2026, month: 7 }] },
        })

        const { data } = await db
            .from('reminders')
            .upsert(
                [
                    { user_id: 'u1', year: 2026, month: 7 },
                    { user_id: 'u2', year: 2026, month: 7 },
                ],
                { onConflict: 'user_id,year,month', ignoreDuplicates: true },
            )
            .select('user_id')

        expect(data).toEqual([{ user_id: 'u2', year: 2026, month: 7 }])
        expect(db._tables.reminders).toHaveLength(2)
    })

    it('bez ignoreDuplicates kolizja aktualizuje istniejący wiersz, nie dokłada drugiego', async () => {
        const db = createMockSupabaseClient({
            tables: { aliases: [{ raw_name_norm: 'kowalski', profile_id: 'stary' }] },
        })

        const { data } = await db
            .from('aliases')
            .upsert({ raw_name_norm: 'kowalski', profile_id: 'nowy' }, { onConflict: 'raw_name_norm' })

        expect(data).toEqual([{ raw_name_norm: 'kowalski', profile_id: 'nowy' }])
        expect(db._tables.aliases).toEqual([{ raw_name_norm: 'kowalski', profile_id: 'nowy' }])
    })

    it('bez onConflict rozstrzyga klucz główny (id), jak PostgREST', async () => {
        const db = createMockSupabaseClient({ tables: { t: [{ id: 'a', v: 1 }] } })

        await db.from('t').upsert({ id: 'a', v: 2 })

        expect(db._tables.t).toEqual([{ id: 'a', v: 2 }])
    })

    it('wiersz bez kolizji wchodzi normalnie', async () => {
        const db = createMockSupabaseClient({ tables: { t: [{ id: 'a', v: 1 }] } })

        const { data } = await db.from('t').upsert({ id: 'b', v: 9 })

        expect(data).toEqual([{ id: 'b', v: 9 }])
        expect(db._tables.t).toHaveLength(2)
    })

    it('insert nadal dokłada bez patrzenia na kolizje (to nie jest upsert)', async () => {
        const db = createMockSupabaseClient({ tables: { t: [{ id: 'a' }] } })

        await db.from('t').insert({ id: 'a' })

        expect(db._tables.t).toHaveLength(2)
    })
})


describe('mock Supabase — select(...) rzutuje na wybrane kolumny', () => {
    const fixture = {
        ludzie: [{ id: 'u1', full_name: 'Anna', email: 'a@x.pl', role: 'admin' }],
    }

    it('zwraca WYŁĄCZNIE wybrane kolumny — pole spoza select to undefined', async () => {
        const db = createMockSupabaseClient({ tables: fixture })
        const { data } = await db.from('ludzie').select('id, full_name')
        expect(data).toEqual([{ id: 'u1', full_name: 'Anna' }])
        expect((data as Array<Record<string, unknown>>)[0].email).toBeUndefined()
    })

    it('działa tak samo dla .single()', async () => {
        const db = createMockSupabaseClient({ tables: fixture })
        const { data } = await db.from('ludzie').select('role').eq('id', 'u1').single()
        expect(data).toEqual({ role: 'admin' })
    })

    it('honoruje alias `nazwa:kolumna`', async () => {
        const db = createMockSupabaseClient({ tables: fixture })
        const { data } = await db.from('ludzie').select('imie:full_name')
        expect(data).toEqual([{ imie: 'Anna' }])
    })

    it('`*` oraz zapytania z osadzeniem przepuszczają cały wiersz', async () => {
        const db = createMockSupabaseClient({ tables: fixture })
        expect((await db.from('ludzie').select('*')).data).toEqual(fixture.ludzie)
        expect((await db.from('ludzie').select('id, manager:profiles(full_name)')).data)
            .toEqual(fixture.ludzie)
    })
})
