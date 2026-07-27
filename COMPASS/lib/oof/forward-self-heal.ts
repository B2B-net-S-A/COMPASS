// Phase 41c — uzgodnienie przekierowań napędzane pracą aplikacji, nie harmonogramem.
//
// Reguła przekierowania nie ma warunków czasowych, więc ktoś musi ją zamknąć po
// urlopie. Phase 41 powierzyła to cronowi — i to okazało się jedynym filarem, którego
// ta instancja nie ma: weryfikacja 2026-07-27 wykazała, że crony Coolify nie wykonują
// się wcale (zero heartbeatów FORWARD_RECONCILE_RUN przez pięć poranków, inbox-ingest
// i tc-sync stoją od maja i czerwca). Reguły zostawały otwarte po urlopach, a zastępcy
// dostawali cudzą pocztę tygodniami.
//
// Rozwiązanie: te same trzy przebiegi odpalane przy okazji normalnego korzystania
// z aplikacji. Ktoś z HR wchodzi na kolejkę wniosków co najmniej raz dziennie, więc
// system domyka się sam. Cron zostaje optymalizacją, przestaje być warunkiem działania.
//
// Plain module (NIE 'use server') — importowany z server-componentu, tak jak
// forward-rule-sync.ts jest współdzielony między akcjami a cronem.

import { logger } from '@/lib/logger'
import { reconcileForwardRules, type ForwardReconcileStats } from './forward-rules'

/**
 * Jak świeże musi być ostatnie uzgodnienie, żeby pominąć kolejne. Godzina to
 * kompromis: skan ~37 skrzynek przez Graph nie jest darmowy, a reguła, która
 * powinna zniknąć, i tak zniknie w ciągu godziny od pierwszego wejścia na stronę.
 */
const MIN_INTERVAL_MS = 60 * 60 * 1000

export type SelfHealOutcome =
    | { ran: true; stats: ForwardReconcileStats }
    | { ran: false; reason: 'recent' | 'error' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Uruchom uzgodnienie, o ile ostatnie było dawniej niż godzinę temu.
 *
 * Throttle czyta audit_logs, a nie pamięć procesu — bo pamięć nie przeżywa deployu
 * ani nie jest wspólna dla instancji, a heartbeat i tak już tam jest. Wpis 'start'
 * powstaje przed właściwą pracą, więc sam działa jak zamek: kolejne wywołanie
 * w trakcie trwającego przebiegu zobaczy świeży wiersz i odpuści.
 *
 * Dwa żądania, które trafią w tę samą milisekundę, mogą przejść oba. Nie robimy
 * z tego problemu — wszystkie trzy przebiegi są idempotentne (zakładanie reguły
 * jest warunkowane brakiem `outlook_forward_rule_id`, kasowanie traktuje 404 jako
 * sukces), a cena to jeden zbędny skan.
 */
export async function maybeSelfHealForwardRules(admin: Admin): Promise<SelfHealOutcome> {
    try {
        const since = new Date(Date.now() - MIN_INTERVAL_MS).toISOString()
        const { data: recent } = await admin
            .from('audit_logs')
            .select('id')
            .eq('action', 'FORWARD_RECONCILE_RUN')
            .gte('created_at', since)
            .limit(1)

        if ((recent ?? []).length > 0) return { ran: false, reason: 'recent' }

        const stats = await reconcileForwardRules(admin)
        logger.info({ event: 'forward_rules.self_heal.done', ...stats })
        return { ran: true, stats }
    } catch (e) {
        // Samoleczenie nigdy nie może wywalić strony, którą tylko podpiera.
        logger.error({
            event: 'forward_rules.self_heal.failed',
            error: e instanceof Error ? e.message : 'unknown',
        })
        return { ran: false, reason: 'error' }
    }
}
