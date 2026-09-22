import 'server-only'

import { createServiceClient } from '@/lib/supabase/admin'

// Odcięcie konta w Supabase Auth przy archiwizacji pracownika (audyt 2026-09-22, SEC-01).
//
// `employment_status = 'exited'` blokuje aplikację (callback, middleware, withAuth — patrz
// employment-access.ts), ale NIE warstwę danych: RLS sprawdza rolę, nie status zatrudnienia,
// a zachowany refresh token pozwalał dalej rozmawiać z Data API bezpośrednio. Blokada w Auth
// uniemożliwia odświeżenie sesji i nowe logowanie; unieważnienie sesji kasuje refresh tokeny.
// Wydany już access token żyje do wygaśnięcia (domyślnie ≤ 1 h) — to świadoma granica.
//
// Moduł celowo NIE jest 'use server': każdy eksport z pliku 'use server' jest publicznym
// endpointem, a tu nie ma żadnego guarda. Wołający MUSI sam sprawdzić uprawnienia.
// Odblokowanie (pomyłkowa archiwizacja): Administracja użytkownikami → Odblokuj (setUserBan).

const PERMANENT_BAN_DURATION = '876000h' // ≈ 100 lat

export async function revokeAccountAccess(userId: string): Promise<void> {
    const admin = createServiceClient()

    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: PERMANENT_BAN_DURATION,
    })
    if (banError) throw new Error(`Nie udało się zablokować konta: ${banError.message}`)

    const { error: revokeError } = await admin.rpc('admin_revoke_user_sessions', {
        target_user_id: userId,
    })
    if (revokeError) throw new Error(`Nie udało się unieważnić sesji: ${revokeError.message}`)
}
