// Phase 21 — shared super-admin guard for server actions.
// Returns the supabase client + user so callers don't re-fetch.
// Source of truth: SUPER_ADMIN_EMAILS env (see lib/auth/super-admins.ts).

import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import type { User } from '@supabase/supabase-js'

export interface SuperAdminContext {
    supabase: ReturnType<typeof createClient>
    user: User
}

export async function requireSuperAdmin(): Promise<SuperAdminContext> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Brak autoryzacji')
    if (!isSuperAdmin(user.email)) {
        throw new Error('Wymagane uprawnienia Super Admina.')
    }
    return { supabase, user }
}
