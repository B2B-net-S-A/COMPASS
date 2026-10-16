import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'
import type { createServiceClient } from '@/lib/supabase/admin'
import type { AuditAction } from '@/lib/actions/audit'
import { logSystemAudit } from '@/lib/audit/system-log'
import { logger } from '@/lib/logger'
import { isExportOff, isMovedToNexus, type HrModule } from './moved-to-nexus'

// Część przełącznika „Ludzie w NEXUSIE” dla tras: crony i eksporty `/api/internal/*`.
// Reguły i zmienne opisuje `lib/hr/moved-to-nexus.ts`.

export const MOVED_TO_NEXUS_REASON = 'przeniesione do NEXUSA'

type CronHandler = (
    request: NextRequest,
    ctx: { admin: ReturnType<typeof createServiceClient> },
) => Promise<Response> | Response

/**
 * Cron przeniesionego modułu pomija pracę, ale przebieg zostawia ślad.
 *
 * Kolejność z resztą wrapperów:
 *   withCronAuth(withCronHeartbeat('X_RUN', skipWhenMovedToNexus('leave', handler)))
 * — heartbeat zapisuje `start` i `done`, a w `done.stats` ląduje powód pominięcia.
 *
 * Trasy bez `withCronHeartbeat` (piszą heartbeat same, na końcu przebiegu) podają
 * `heartbeat`: wtedy pominięcie zapisuje jeden wpis `done` z powodem — inaczej brak
 * wpisu czytałby się jak „harmonogram nie dosięgnął trasy”.
 *
 * 200 z `ok: true`: pominięcie jest stanem zamierzonym, nie awarią — workflowy GH
 * sprawdzające `.ok == true` mają zostać zielone.
 */
export function skipWhenMovedToNexus(
    module: HrModule,
    handler: CronHandler,
    opts: { heartbeat?: AuditAction } = {},
): CronHandler {
    return async (request, ctx) => {
        if (!isMovedToNexus(module)) return handler(request, ctx)
        const body = { ok: true, skipped: true, module, reason: MOVED_TO_NEXUS_REASON }
        logger.info({ event: 'cron.skipped_moved_to_nexus', module, path: new URL(request.url).pathname })
        if (opts.heartbeat) {
            await logSystemAudit(null, opts.heartbeat, { phase: 'done', status: 200, ...body })
        }
        return NextResponse.json(body)
    }
}

/**
 * 410 dla eksportu modułu z `HR_EXPORTS_OFF`, inaczej `null` (trasa działa jak dotąd).
 * Wołane PO sprawdzeniu sekretu — nieuwierzytelnione żądanie nie dowiaduje się o przełączeniu.
 *
 * 410, a nigdy pusta lista: NEXUS przy pustym rosterze wchodzi w pętlę wyłączania kont,
 * a ATLAS uzgadnia pełny zbiór sygnałów (pusta lista = wycofanie wszystkich). Oba traktują
 * 4xx jako awarię pobrania i niczego nie zmieniają.
 */
export function movedExportResponse(module: HrModule): Response | null {
    if (!isExportOff(module)) return null
    return NextResponse.json(
        {
            error: 'moved_to_nexus',
            module,
            message: 'Eksport wyłączony: moduł działa teraz w NEXUSIE.',
        },
        { status: 410, headers: { 'Cache-Control': 'private, no-store' } },
    )
}
