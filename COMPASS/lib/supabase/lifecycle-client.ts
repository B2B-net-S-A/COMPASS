// Phase 22 (2026-05-17) → audyt 2026-08-25 (C12.3).
//
// Moduł powstał, gdy tabele lifecycle'u (onboarding_*, exit_interviews, offboarding_*,
// lifecycle_*) i RPC (start_onboarding_for_user, start_offboarding_for_user) nie były
// jeszcze w wygenerowanym database.types.ts — typowany klient odrzucał ich nazwy, więc
// wrappery zwracały `any`, żeby nie zasypywać wywołań rzutowaniami.
//
// Powód wygasł: wszystkie te tabele i RPC są już w database.types.ts, więc wrappery
// zwracają w pełni typowane klienty. Zostają jako cienki alias — importuje je 7 plików
// lifecycle'u, a przemianowanie ich na `createClient`/`createServiceClient` byłoby
// zmianą bez wartości. Nowy kod może wołać oryginały wprost.

import 'server-only'

import { createClient as createTyped } from '@/lib/supabase/server'
import { createServiceClient as createServiceTyped } from '@/lib/supabase/admin'

export function createLifecycleClient() {
    return createTyped()
}

export function createLifecycleAdminClient() {
    return createServiceTyped()
}
