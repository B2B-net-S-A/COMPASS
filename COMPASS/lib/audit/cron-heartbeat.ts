import 'server-only'

import type { NextRequest } from 'next/server'
import type { createServiceClient } from '@/lib/supabase/admin'
import type { AuditAction } from '@/lib/actions/audit'
import { logSystemAudit } from '@/lib/audit/system-log'

// Audyt 2026-08 (C11) — heartbeat zadania cyklicznego.
//
// Większość tras w app/api/cron/ nie zostawiała w bazie ŻADNEGO śladu wykonania:
// wynik żył wyłącznie w odpowiedzi HTTP (za CRON_SECRET) i w logach kontenera.
// Cicha awaria harmonogramu — a te potrafią nie odpalać tygodniami (patrz
// `coolify_cron_needs_container_name`, Phase 41b/54) — była więc niewykrywalna
// bez SSH i zauważalna dopiero po tym, że coś przestało się dziać.
//
// Wzorzec (z lib/oof/forward-rules.ts): jeden wpis `phase: 'start'` na wejściu,
// jeden `phase: 'done'` na wyjściu. Diagnoza z samego audytu:
//   • `start` + `done`      → przebieg się wykonał, `stats` mówi z jakim skutkiem
//   • `start` bez `done`    → żądanie ubite w locie (timeout / restart kontenera)
//   • brak `start`          → harmonogram w ogóle nie dosięgnął trasy
//
// Dlaczego wrapper, a nie dwa wywołania w każdej trasie: trasy mają po kilka
// punktów wyjścia (wczesne `return`, gałęzie błędu, rzuty). Ręczne dopisywanie
// `done` do każdego z nich gwarantuje, że któryś zostanie pominięty i powstanie
// fałszywy sygnał „ubity w locie". Tutaj `done` idzie z bloku try/catch, więc
// obejmuje wszystkie ścieżki, a statystyki bierzemy z ciała odpowiedzi, którą
// trasa i tak buduje — bez dublowania liczników.
//
// MUSI iść przez logSystemAudit (service-rola): od migracji A3.2 polityka INSERT
// na audit_logs to `auth.uid() = user_id`, a heartbeat ma `user_id = null`.

type CronHandler = (
    request: NextRequest,
    ctx: { admin: ReturnType<typeof createServiceClient> },
) => Promise<Response> | Response

/** Ciało odpowiedzi bywa duże (listy błędów) — audyt ma być czytelny, nie kompletny. */
const MAX_STATS_CHARS = 4000

async function summarizeResponse(response: Response): Promise<Record<string, unknown>> {
    try {
        const text = await response.clone().text()
        if (!text) return {}
        if (text.length > MAX_STATS_CHARS) {
            return { statsTruncated: true, stats: text.slice(0, MAX_STATS_CHARS) }
        }
        try {
            return { stats: JSON.parse(text) }
        } catch {
            return { stats: text }
        }
    } catch {
        // Odpowiedź bez ciała albo strumieniowa — heartbeat bez statystyk jest
        // wciąż wart więcej niż brak heartbeatu.
        return {}
    }
}

/**
 * Owija handler crona parą wpisów audytowych `*_RUN`. Komponuje się z withCronAuth:
 *
 *   export const GET = withCronAuth(withCronHeartbeat('X_RUN', async (req, { admin }) => …))
 *
 * Kolejność ma znaczenie: heartbeat jest WEWNĄTRZ auth, więc odbite żądanie (401/503)
 * nie zostawia śladu — inaczej skan sekretu podszywałby się pod przebieg zadania.
 */
export function withCronHeartbeat(action: AuditAction, handler: CronHandler): CronHandler {
    return async (request, ctx) => {
        const startedAt = Date.now()
        await logSystemAudit(null, action, {
            phase: 'start',
            at: new Date(startedAt).toISOString(),
        })

        try {
            const response = await handler(request, ctx)
            await logSystemAudit(null, action, {
                phase: 'done',
                status: response.status,
                durationMs: Date.now() - startedAt,
                ...(await summarizeResponse(response)),
            })
            return response
        } catch (e) {
            // Rzut zostaje przekazany dalej (runtime zwróci 500 i Sentry go złapie) —
            // heartbeat tylko dopisuje, że przebieg zakończył się awarią.
            await logSystemAudit(null, action, {
                phase: 'done',
                failed: true,
                durationMs: Date.now() - startedAt,
                error: e instanceof Error ? e.message : String(e),
            })
            throw e
        }
    }
}
