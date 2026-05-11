import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMockSupabaseClient, isSupabaseConfigured } from './mock-client'

// Phase 18.5: `Database` type dostępny w `lib/supabase/database.types.ts` —
// per-query opt-in (cast `as SupabaseClient<Database>` gdy chcesz typed access).

// Singleton — one instance per browser tab to avoid auth lock conflicts
let client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (client) return client

  if (!isSupabaseConfigured()) {
    client = createMockSupabaseClient()
    return client
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  client = createBrowserClient(url, key)
  return client
}
