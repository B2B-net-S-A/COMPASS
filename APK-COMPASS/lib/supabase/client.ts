import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMockSupabaseClient, isSupabaseConfigured } from './mock-client'
import type { Database } from './database.types'

// Singleton — one instance per browser tab to avoid auth lock conflicts
let client: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  if (client) return client

  if (!isSupabaseConfigured()) {
    client = createMockSupabaseClient() as SupabaseClient<Database>
    return client
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  client = createBrowserClient<Database>(url, key)
  return client
}
