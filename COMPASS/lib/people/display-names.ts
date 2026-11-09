import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/logger'

export interface PersonDisplayName {
    full_name: string | null
    avatar_url: string | null
}

type DisplayNameRow = PersonDisplayName & { id: string }

function toMap(rows: DisplayNameRow[] | null): Map<string, PersonDisplayName> {
    return new Map((rows ?? []).map((row) => [row.id, { full_name: row.full_name, avatar_url: row.avatar_url }]))
}

/**
 * Imiona i awatary do etykiet (autorzy, prowadzący, opiekunowie, uczestnicy dyskusji).
 * Konto `consultant` widzi w `profiles` tylko swój wiersz, więc czytamy przez RPC
 * `people_display_names`, które zwraca wyłącznie osoby powiązane z tym kontem.
 *
 * To DEKORACJA: awaria ma zubożyć etykietę, a nie wywrócić ekran, dlatego brak `requireRows`.
 * Zapasowy odczyt działa do czasu zastosowania migracji `20261109120000`
 * (kod wchodzi pierwszy) i po niej nie ma już zastosowania.
 */
export async function fetchDisplayNames(
    client: SupabaseClient,
    userIds: string[],
): Promise<Map<string, PersonDisplayName>> {
    const ids = Array.from(new Set(userIds))
    if (ids.length === 0) return new Map()

    const { data, error } = await client.rpc('people_display_names', { p_user_ids: ids })
    if (!error) return toMap(data as DisplayNameRow[] | null)

    logger.warn({ event: 'people.display_names.rpc_failed', code: error.code })
    const { data: rows, error: readError } = await client
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids)
    if (readError) {
        logger.warn({ event: 'people.display_names.read_failed', code: readError.code })
        return new Map()
    }
    return toMap(rows as DisplayNameRow[] | null)
}
