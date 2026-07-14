import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import { createServiceClient } from '@/lib/supabase/admin'
import type { DbRole } from '@/lib/types/role'

// Phase 18.3: delegacja do atomic Postgres function `public.sync_user_role`.
// Eliminuje race condition gdy 3 callery login flow (email+pw, OAuth callback,
// auto-login) wywołują równolegle. Wcześniej był 2-step (SELECT + UPDATE),
// teraz single RPC z SECURITY DEFINER + MVCC.
//
// Logika nie zmieniona:
//   - admin_access_list lub SUPER_ADMIN_EMAILS  → admin
//   - currentRole === 'internal' (Phase 11a)    → internal (preserved)
//   - else                                       → consultant

export async function syncRole(
    supabase: SupabaseClient,
    userId: string,
    email: string,
    _currentRole: string,
): Promise<DbRole> {
    const emailLower = email.toLowerCase()
    const isSuperAdminFlag = isSuperAdmin(emailLower)

    // The database RPC is service-role-only. Before crossing that boundary,
    // independently verify that the user-scoped client belongs to the exact
    // account being synchronized. This prevents callers from using the server
    // helper as a confused deputy for another profile.
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()
    const verifiedEmail = user?.email?.toLowerCase()
    if (userError || !user || user.id !== userId || verifiedEmail !== emailLower) {
        throw new Error('sync_user_role failed: verified user mismatch')
    }

    const admin = createServiceClient()

    const { data, error } = await admin.rpc('sync_user_role', {
        p_user_id: userId,
        p_email: emailLower,
        p_is_super_admin: isSuperAdminFlag,
    })

    if (error) {
        // Fail closed: jeśli RPC fails (np. user nie w profiles), nie zwracaj
        // mock'owego admina — propaguj error, caller (login action) decyduje
        // czy block sign-in czy fallback.
        throw new Error(`sync_user_role failed: ${error.message}`)
    }

    return data as DbRole
}
