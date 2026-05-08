import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import type { DbRole } from '@/lib/types/role'

// Phase 11a/16: 3-role model — enum user_role = (consultant | admin | internal).
// Used by both email+password login (app/login/actions.ts) and the OAuth
// callback (app/auth/callback/route.ts) so SSO logins also pick up admin
// privileges from SUPER_ADMIN_EMAILS / admin_access_list.
//
// admin_access_list is the source of truth for the admin role; syncRole only
// promotes/demotes admin based on it. The `internal` role is set manually by
// admins via UserManagementPanel (setUserRole) and is preserved across logins
// — without this, every login would clobber it back to `consultant`.

export async function syncRole(
    supabase: SupabaseClient,
    userId: string,
    email: string,
    currentRole: string,
): Promise<DbRole> {
    const emailLower = email.toLowerCase()

    let shouldBeAdmin = isSuperAdmin(emailLower)
    if (!shouldBeAdmin) {
        const { data: adminEntry } = await supabase
            .from('admin_access_list')
            .select('id')
            .eq('email', emailLower)
            .maybeSingle()
        shouldBeAdmin = !!adminEntry
    }

    let target: DbRole
    if (shouldBeAdmin) {
        target = 'admin'
    } else if (currentRole === 'internal') {
        target = 'internal'
    } else {
        target = 'consultant'
    }

    if (currentRole !== target) {
        await supabase.from('profiles').update({ role: target }).eq('id', userId)
    }
    return target
}
