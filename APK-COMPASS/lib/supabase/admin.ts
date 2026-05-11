import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ─── Service-role Supabase client ────────────────────────────────────────────
// RLS-bypass client. Wywoływać TYLKO po przejściu `requireSuperAdmin()`
// (lub innej kontroli uprawnień po stronie servera).
//
// `import 'server-only'` rzuci błąd buildowy jeśli ktokolwiek zaimportuje ten
// moduł z client component / client bundlu — zabezpiecza przed leakiem
// SUPABASE_SERVICE_ROLE_KEY do przeglądarki.
//
// Phase 18.5: `Database` type dostępny w `lib/supabase/database.types.ts` —
// per-query opt-in (cast `as SupabaseClient<Database>` gdy chcesz typed access).
// Server-wide typing odroczone: ujawnia ~50 legacy bug-ów wymagających
// osobnego cleanup PR (tabela `candidates` archived, etc.).
// ─────────────────────────────────────────────────────────────────────────────

let cached: SupabaseClient | null = null

export function createServiceClient(): SupabaseClient {
    if (cached) return cached

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL nie jest skonfigurowany — service client niedostępny.')
    }
    if (!serviceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY nie jest skonfigurowany — service client niedostępny.')
    }

    cached = createClient(url, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })

    return cached
}
