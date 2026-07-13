import { createServerClient } from '@supabase/ssr'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'
import { createMockSupabaseClient, getBypassEmail, isSupabaseConfigured, BYPASS_USER } from './mock-client'
import type { Database } from './database.types'

export function createClient() {
    try {
        const bypassEmail = getBypassEmail()
        if (!isSupabaseConfigured()) {
            // Emergency local mode must keep a synchronous factory for legacy
            // callers. Production never enters this branch; configured
            // Supabase uses the fully async cookie adapter below.
            const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies
            const cookieEmail = cookieStore.get('emergency_auth_user')?.value
            if (bypassEmail && cookieEmail === bypassEmail) {
                return createMockSupabaseClient(BYPASS_USER as any)
            }
            return createMockSupabaseClient()
        }

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) {
            return createMockSupabaseClient()
        }

        // ─── Normal authenticated flow ─────────────────────────────────
        // Phase 18.5: typed with Database from generated types.
        const client = createServerClient<Database>(
        url,
        key,
        {
            cookies: {
                async getAll() {
                    return (await cookies()).getAll()
                },
                async setAll(cookiesToSet) {
                    try {
                        const cookieStore = await cookies()
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
