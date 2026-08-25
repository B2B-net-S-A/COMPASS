import 'server-only'

import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/admin'
import { logCompat } from '@/lib/logger'
import type { AuditAction } from '@/lib/actions/audit'

// Audyt 2026-08 (A3.2): polityka INSERT na audit_logs została zacieśniona do
// `WITH CHECK (auth.uid() = user_id)`, bo poprzednia sprowadzała się do
// „ktokolwiek zalogowany" i pozwalała podrzucić wpis z CUDZYM user_id.
//
// Są jednak legalne zapisy, których ta reguła nie przepuszcza, bo user_id
// celowo NIE jest autorem żądania:
//   1. heartbeaty maszynowe (`user_id = null`) pisane poza żądaniem crona —
//      np. samoleczenie reguł przekierowania poczty odpalane przy renderze
//      kolejki wniosków (lib/oof/forward-rules.ts). Ten wpis NIE jest tylko
//      śladem: forward-self-heal.ts czyta go jako zamek, który powstrzymuje
//      pełny skan ~37 skrzynek Graph przy każdym wejściu admina na ekran.
//   2. wpisy o korekcie cudzego dokumentu, gdzie `user_id` to WŁAŚCICIEL
//      timesheetu, a sesja należy do akceptującego (internal-leave.ts).
//
// Dlaczego osobny moduł, a nie parametr w logAudit(): lib/actions/audit.ts ma
// dyrektywę 'use server', więc każdy jego eksport jest publicznym endpointem.
// Flaga „pisz service-rolą" byłaby wołalna z przeglądarki i odtworzyłaby
// dokładnie tę możliwość fałszowania audytu, którą migracja A3.2 zamyka.
// Ten moduł jest zwykłym modułem serwerowym ('server-only'), więc nie da się
// go wywołać z klienta.
//
// Nie dodawaj tu 'use server'.
export async function logSystemAudit(
    userId: string | null,
    action: AuditAction,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: Record<string, any>,
): Promise<void> {
    try {
        let ip = 'system'
        try {
            ip = headers().get('x-forwarded-for') || 'system'
        } catch {
            // Poza kontekstem żądania (np. zadanie w tle) headers() rzuca —
            // to nie powód, żeby zgubić wpis audytowy.
        }

        const { error } = await createServiceClient().from('audit_logs').insert({
            user_id: userId,
            action,
            details,
            ip_address: ip,
        })

        if (error) logCompat.error('Failed to write system audit log:', error)
    } catch (e) {
        // Audyt nigdy nie może wywrócić operacji, którą opisuje.
        logCompat.error('Failed to write system audit log:', e)
    }
}
