import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

// ════════════════════════════════════════════════════════════════════════════
// Audyt 2026-08 (B1) — jeden kontrakt błędu dla server actions.
//
// Naprawia DWIE klasy problemów, bo mają jedną przyczynę:
//
// 1. MASKOWANIE. Next.js w produkcji zastępuje treść wyjątku rzuconego
//    z `'use server'` generycznym „An error occurred in the Server Components
//    render". Użytkownik przekraczający limit urlopu widział bełkot zamiast
//    „pozostało X dni". Komunikat dociera tylko wtedy, gdy jest ZWRÓCONY jako
//    dane — nie rzucony. Dotychczasową odpowiedzią były łatki punktowe
//    (TEAM_SIZE_MAX, CARD_TITLE_MAX); trzecia taka łatka była sygnałem,
//    że potrzebny jest wspólny mechanizm.
//
// 2. ŚLEPOTA SENTRY. @sentry/nextjs 8.55.2 NIE instrumentuje plików
//    'use server' — jego wrapping loader zna tylko page / api-route /
//    server-component / route-handler / middleware, a `onRequestError`
//    z instrumentation.ts to hook Next 15, martwy na 14.2.35. Żaden wyjątek
//    z 810 `throw` w lib/actions nie generował zdarzenia.
//
// ROZRÓŻNIENIE JEST ISTOTNE — bez niego Sentry utonie w szumie i wypali
// limit 5k zdarzeń/mies. na darmowym planie:
//   • ExpectedError  → walidacja i guardy. To normalny przebieg programu,
//                      użytkownik ma zobaczyć treść. NIE idzie do Sentry.
//   • cokolwiek inne → realna awaria. Idzie do Sentry, użytkownik dostaje
//                      komunikat ogólny (bez wycieku szczegółów bazy).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Kanoniczny kształt odpowiedzi server action.
 *
 * Ta sama unia była zdefiniowana niezależnie w trzech miejscach
 * (`lib/types/learning.ts`, `lib/types/incubator.ts`, `lib/types/news.ts`).
 * Tamte nazwy zostają jako aliasy, żeby nie przepisywać całych modułów naraz,
 * ale nowy kod używa tego typu.
 */
export type ActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string }

/**
 * Błąd, którego treść MA zobaczyć użytkownik: nieprzeszła walidacja,
 * odmowa uprawnień, naruszenie reguły biznesowej.
 *
 * Nie trafia do Sentry — to nie awaria, tylko normalny przebieg.
 */
export class ExpectedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ExpectedError'
    }
}

/** Komunikat zastępczy dla awarii — nie ujawnia szczegółów bazy ani ścieżek. */
export const UNEXPECTED_ERROR_PL =
    'Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę — jeśli problem wróci, daj znać administratorowi.'

/**
 * Opakowuje ciało server action i zamienia wyjątek na dane.
 *
 * ```ts
 * export async function createThing(input: Input): Promise<ActionResult<{ id: string }>> {
 *     return runAction('createThing', async () => {
 *         const ctx = await requireInternalOrAdminAction()
 *         if (!input.name) throw new ExpectedError('Podaj nazwę.')
 *         return { id: await insert(input, ctx) }
 *     })
 * }
 * ```
 *
 * `actionName` trafia do Sentry i do loga — bez niego stos z zminifikowanego
 * bundla produkcyjnego jest bezużyteczny.
 */
export async function runAction<T>(
    actionName: string,
    body: () => Promise<T>,
): Promise<ActionResult<T>> {
    try {
        return { success: true, data: await body() }
    } catch (error: unknown) {
        if (error instanceof ExpectedError) {
            // Świadomie bez Sentry: to nie awaria. Log na poziomie info, żeby
            // dało się zobaczyć, o które reguły użytkownicy się najczęściej obijają.
            logger.info({ event: 'action.rejected', action: actionName, reason: error.message })
            return { success: false, error: error.message }
        }

        // Guardy autoryzacyjne rzucają zwykłym Error i MAJĄ być zamaskowane —
        // ale chcemy o nich wiedzieć, więc idą do Sentry jak każda awaria.
        Sentry.captureException(error, { tags: { action: actionName, layer: 'server-action' } })
        logger.error({ event: 'action.failed', action: actionName, error })
        return { success: false, error: UNEXPECTED_ERROR_PL }
    }
}

/**
 * Skrót dla wywołujących, którzy wolą wyjątek niż gałąź — np. gdy akcja jest
 * wołana z innej akcji, a nie z komponentu.
 */
export function unwrap<T>(result: ActionResult<T>): T {
    if (!result.success) throw new ExpectedError(result.error)
    return result.data
}
