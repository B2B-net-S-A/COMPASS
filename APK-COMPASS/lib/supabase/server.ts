import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createMockSupabaseClient, isSupabaseConfigured, BYPASS_USER } from './mock-client'

export function createClient() {
    try {
        const cookieStore = cookies()
        if (!isSupabaseConfigured()) {
            const bypassEmail = cookieStore.get('emergency_auth_user')?.value
            if (bypassEmail === 'zbigniew.twardowski@b2bnetwork.pl') {
                return createMockSupabaseClient(BYPASS_USER as any)
            }
            return createMockSupabaseClient()
        }

        const emergencyUser = cookieStore.get('emergency_auth_user')?.value
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) {
            return createMockSupabaseClient(emergencyUser === 'zbigniew.twardowski@b2bnetwork.pl' ? (BYPASS_USER as any) : undefined)
        }

        // ─── Bypass cookie cleanup ──────────────────────────────────────
        // When Supabase is configured, ignore the emergency bypass cookie.
        // Users should log in with real credentials so auth.uid() works
        // correctly with RLS policies. The bypass was only needed when
        // Supabase wasn't configured.
        if (emergencyUser) {
            console.info('[SERVER] Bypass cookie detected but Supabase is configured — ignoring bypass, using normal auth flow.')
        }

        // ─── Normal authenticated flow ─────────────────────────────────
        const client = createServerClient(
        url,
        key,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                    }
                },
            },
        }
        )

        return client
    } catch (_e) {
        return createMockSupabaseClient()
    }
}
