import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/auth/super-admins'

// Phase 16 (2026-05-07): two-role model. enum user_role = (consultant | admin).
// Used by both email+password login (app/login/actions.ts) and the OAuth
// callback (app/auth/callback/route.ts) so SSO logins also pick up admin
// privileges from SUPER_ADMIN_EMAILS / admin_access_list.

export async function syncRole(
    supabase: SupabaseClient,
    userId: string,
    email: string,
    currentRole: string,
): Promise<'admin' | 'consultant'> {
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

    const target: 'admin' | 'consultant' = shouldBeAdmin ? 'admin' : 'consultant'
    if (currentRole !== target) {
        await supabase.from('profiles').update({ role: target }).eq('id', userId)
    }
    return target
}
