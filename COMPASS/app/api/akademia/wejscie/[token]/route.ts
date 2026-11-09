import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { claimLearnerEntry, createLearnerSessionHash, ensureLearnerUser, resolveLearnerPass } from '@/lib/academy/learner-entry'
import { CURRENT_LEARNER_INFO_VERSION } from '@/lib/academy/learner-info'
import { logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'private, no-store' }
const bodySchema = z.object({ accepted: z.literal(true), version: z.string().max(64) })

function reply(body: Record<string, unknown>, status: number) {
    return NextResponse.json(body, { status, headers: HEADERS })
}

/**
 * Pierwsze wejście przez przepustkę. Konto powstaje dopiero tutaj, po naciśnięciu przycisku:
 * GET strony niczego nie zapisuje, bo skanery poczty otwierają linki. Sesję zakłada
 * przeglądarka przez `verifyOtp`, więc `/auth/callback` zostaje bez zmian.
 */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return reply({ error: 'Potwierdź zapoznanie się z informacją o danych.' }, 400)
    if (parsed.data.version !== CURRENT_LEARNER_INFO_VERSION) return reply({ error: 'Treść informacji o danych zmieniła się. Odśwież stronę.' }, 409)

    try {
        const client = createServiceClient() as unknown as SupabaseClient
        const resolved = await resolveLearnerPass(client, params.token)
        if (resolved.status === 'not_found') return reply({ error: 'Nie znaleziono.' }, 404)
        if (resolved.status === 'used' || !await claimLearnerEntry(client, resolved, parsed.data.version)) {
            return reply({ error: 'Ten link został już użyty.', used: true }, 410)
        }
        const userId = await ensureLearnerUser(client, resolved.account)
        if (!userId) return reply({ error: 'Nie udało się przygotować konta. Skontaktuj się z organizatorem szkolenia.' }, 409)
        const tokenHash = await createLearnerSessionHash(client, resolved.account.email, userId)
        if (!tokenHash) return reply({ error: 'Nie udało się przygotować wejścia. Spróbuj ponownie później.' }, 503)
        return reply({ tokenHash }, 200)
    } catch (error) {
        logger.error({ event: 'academy.learner_entry.failed', error })
        return reply({ error: 'Nie udało się przygotować wejścia. Spróbuj ponownie później.' }, 503)
    }
}
