import { ExpectedError } from '@/lib/actions/expected-error'
import { createClient } from '@/lib/supabase/server'
import { perRequestCache } from '@/lib/utils/request-cache'
import { ACADEMY_ONLY_DENIED_MESSAGE, isAcademyOnlyUser } from './academy-only'

const SESSION_CHECK_FAILED = 'Nie udało się sprawdzić sesji. Spróbuj ponownie.'

const loadIsAcademyOnly = perRequestCache(async function loadIsAcademyOnly(): Promise<boolean> {
    const { data, error } = await createClient().auth.getUser()
    // Awaria Auth nie może przepuścić konta nauki. Brak sesji to nie awaria i rozstrzyga go akcja.
    if (error && error.name !== 'AuthSessionMissingError') throw new ExpectedError(SESSION_CHECK_FAILED)
    return isAcademyOnlyUser(data?.user)
})

/**
 * Odmowa dla konta nauki w akcjach, które nie przechodzą przez guardy z `internal-guard`
 * (własny `getUser`, klient service role). Stoi w pierwszej linii ciała, bo akcję da się
 * wywołać POST-em z dozwolonej strony. Brak sesji nie jest tu odmową: to rozstrzyga akcja.
 * Pilnuje tego test `lib/auth/__tests__/academy-only-isolation.test.ts`.
 */
export async function assertNotAcademyOnly(): Promise<void> {
    if (await loadIsAcademyOnly()) throw new ExpectedError(ACADEMY_ONLY_DENIED_MESSAGE)
}
