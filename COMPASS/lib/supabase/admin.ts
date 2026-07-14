import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// ─── Service-role Supabase client ────────────────────────────────────────────
// RLS-bypass client. Wywoływać TYLKO po przejściu `requireSuperAdmin()`
// (lub innej kontroli uprawnień po stronie servera).
//
// `import 'server-only'` rzuci błąd buildowy jeśli ktokolwiek zaimportuje ten
// moduł z client component / client bundlu — zabezpiecza przed leakiem
// SUPABASE_SERVICE_ROLE_KEY do przeglądarki.
//
// Phase 18.5: typed with Database from generated types — eliminuje większość
// `as any` casts w lib/actions/.
// ─────────────────────────────────────────────────────────────────────────────

const DATABASE_PROBE_TIMEOUT_MS = 2_000

interface ServiceConfiguration {
    url: string
    key: string
}

let cached: (ServiceConfiguration & { client: SupabaseClient<Database> }) | null = null

function readServiceConfiguration(env: NodeJS.ProcessEnv): ServiceConfiguration {
    const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    // New Supabase secret keys are preferred because they can be rotated per
    // service. The legacy service-role key remains a compatibility fallback.
    const key = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!rawUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL nie jest skonfigurowany — service client niedostępny.')
    }
    if (!key) {
        throw new Error('Prywatny klucz Supabase nie jest skonfigurowany — service client niedostępny.')
    }

    let parsed: URL
    try {
        parsed = new URL(rawUrl)
    } catch {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL ma nieprawidłowy format — service client niedostępny.')
    }

    const isLocal = parsed.hostname === 'localhost'
        || parsed.hostname === '127.0.0.1'
        || parsed.hostname === '::1'
    if ((parsed.protocol !== 'https:' && !isLocal) || parsed.username || parsed.password) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL musi być bezpiecznym adresem HTTPS.')
    }

    return { url: parsed.toString().replace(/\/$/, ''), key }
}

function createPrivilegedClient(
    config: ServiceConfiguration,
    fetchImpl?: typeof fetch,
): SupabaseClient<Database> {
    const noStoreFetch: typeof fetch | undefined = fetchImpl
        ? (input, init) => fetchImpl(input, {
            ...init,
            cache: 'no-store',
            redirect: 'error',
        })
        : undefined

    return createClient<Database>(config.url, config.key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
        ...(noStoreFetch ? { global: { fetch: noStoreFetch } } : {}),
    })
}

export function createServiceClient(): SupabaseClient<Database> {
    // Resolve configuration before consulting the cache. Removing or rotating
    // the credential must fail closed instead of returning a stale client.
    const config = readServiceConfiguration(process.env)
    if (cached?.url === config.url && cached.key === config.key) return cached.client

    const client = createPrivilegedClient(config)
    cached = { ...config, client }
    return client
}

/**
 * Readiness probe kept inside the same credential boundary as the privileged
 * client. Callers receive only a boolean, never the secret or request headers.
 */
export async function probeServiceDatabase(): Promise<boolean> {
    const config = readServiceConfiguration(process.env)
    const client = createPrivilegedClient(config, fetch)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DATABASE_PROBE_TIMEOUT_MS)

    try {
        const { error } = await client
            .from('profiles')
            .select('id')
            .limit(1)
            .abortSignal(controller.signal)
        return !error
    } finally {
        clearTimeout(timer)
    }
}
