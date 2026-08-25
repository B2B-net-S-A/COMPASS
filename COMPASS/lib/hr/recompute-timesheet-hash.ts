import 'server-only'

import type { createServiceClient } from '@/lib/supabase/admin'
import { computeTimesheetHash, type TimesheetEntryForHash } from './timesheet-hash'

// Audyt 2026-08 — jedna implementacja przeliczania `timesheets.pdf_hash`.
//
// H2.8 zapisuje przy akceptacji hash wpisów; trasa PDF przelicza go ponownie
// i przy niezgodności zwraca 409 („wykryto rozbieżność integralności").
// Każda ścieżka, która zmienia wpisy JUŻ ZAAKCEPTOWANEGO timesheetu, musi więc
// hash odświeżyć — inaczej pracownik nie pobierze swojej karty pracy.
//
// Dotąd robił to wyłącznie moduł urlopowy (auto-wpisy płatnego urlopu). Ścieżki
// nadgodzin administratora (adminOverrideTimesheetEntry / clearOvertimeOverride)
// zmieniały `hours` bez przeliczenia — po takiej korekcie na zaakceptowanym
// timesheecie PDF przestawał się pobierać, a w audycie lądował TIMESHEET_HASH_MISMATCH
// sugerujący ingerencję w bazę, choć zmiana szła przez legalną akcję w aplikacji.

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Przelicza `pdf_hash` timesheetu, jeśli w ogóle był ustawiony (czyli timesheet
 * przeszedł przez akceptację). Dla szkiców to no-op — nie ma czego pilnować.
 */
export async function recomputeTimesheetHashIfSet(
    admin: ServiceClient,
    timesheetId: string,
): Promise<void> {
    const { data: ts } = await admin
        .from('timesheets')
        .select('pdf_hash')
        .eq('id', timesheetId)
        .maybeSingle<{ pdf_hash: string | null }>()
    if (!ts?.pdf_hash) return

    const { data: entries } = await admin
        .from('timesheet_entries')
        .select('work_date, hours, project, description')
        .eq('timesheet_id', timesheetId)

    const newHash = computeTimesheetHash((entries ?? []) as TimesheetEntryForHash[])
    if (newHash !== ts.pdf_hash) {
        await admin.from('timesheets').update({ pdf_hash: newHash } as never).eq('id', timesheetId)
    }
}
