import { createServiceClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/auth/super-admins'
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
//
// Audyt 2026-08: klient jest tworzony TUTAJ (service-role), a nie przyjmowany
// od wywołującego. Powód: `public.sync_user_role` to SECURITY DEFINER, które
// przyjmuje p_user_id / p_email / p_is_super_admin jako parametry i nie sprawdza
// auth.uid(). Dopóki EXECUTE miała rola `authenticated`, dowolny zalogowany
// mógł jednym POST /rest/v1/rpc/sync_user_role nadać sobie (albo komukolwiek)
// rolę admin — lub zdegradować cudzego admina do consultant.
// Po odebraniu tego uprawnienia migracją funkcja jest osiągalna WYŁĄCZNIE
// service-rolą, więc ścieżka logowania musi ją wołać właśnie tak.
// Nie przywracaj parametru `supabase` — to cofnęłoby całą naprawę.

export async function syncRole(
    userId: string,
    email: string,
    _currentRole: string,
): Promise<DbRole> {
    const emailLower = email.toLowerCase()
    const isSuperAdminFlag = isSuperAdmin(emailLower)
    const supabase = createServiceClient()

    const { data, error } = await supabase.rpc('sync_user_role', {
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
