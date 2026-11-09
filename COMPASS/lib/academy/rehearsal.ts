import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

let rehearsalColumnPresent = false

/** Kolumnę dokłada migracja, a kod jedzie na produkcję wcześniej; bez niej lista działa bez filtra.
 *  Raz wykryta kolumna nie znika, więc po migracji nie ma już dodatkowego zapytania. */
export async function canFilterRehearsal(client: SupabaseClient): Promise<boolean> {
    if (rehearsalColumnPresent) return true
    const { error } = await client.from('courses').select('is_rehearsal', { head: true }).limit(1)
    rehearsalColumnPresent = !error
    return rehearsalColumnPresent
}

/** Null do czasu ustawienia daty startu (także przed migracją): raporty mają wtedy etykietę „próba”. */
export async function readReportsStartAt(client: SupabaseClient): Promise<string | null> {
    const { data, error } = await client.rpc('academy_reports_start_at')
    return !error && typeof data === 'string' ? data : null
}

export function isCountedAfterStart(moment: string | null | undefined, startAt: string | null): boolean {
    if (!startAt) return true
    return !!moment && new Date(moment).getTime() >= new Date(startAt).getTime()
}
