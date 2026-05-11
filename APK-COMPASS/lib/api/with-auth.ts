import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import type { DbRole } from '@/lib/types/role'

// Phase 18.7: ujednolicony auth wrapper dla API routes (/api/**).
// Wcześniej każdy z 22 routes miał własny boilerplate:
//   - getUser() + role check
//   - cron: CRON_SECRET header/query parsing
// Z czego cron pattern miał subtelne różnice — niektóre logowały warning,
// niektóre nie, niektóre nie miały timing-safe comparison.

// ─── 1. withCronAuth — dla cron jobs ────────────────────────────────────

type CronHandler = (request: NextRequest, ctx: { admin: ReturnType<typeof createServiceClient> }) => Promise<Response> | Response

/**
 * Wrap cron handler:
 *   - Wymaga `Authorization: Bearer <CRON_SECRET>` header (preferred)
 *   - Fallback: `?secret=<CRON_SECRET>` query param (deprecated, loguje warning)
 *   - 503 jeśli CRON_SECRET nie skonfigurowany
 *   - 401 jeśli secret nie pasuje
 *   - Przekazuje `admin` (service_role client) do handlera
 *
 * Timing-safe comparison NIE jest implementowane bo CRON_SECRET to high-entropy
 * random string (32+ bytes), nie predictable (timing attacks praktycznie
 * niemożliwe). Standard string-equality wystarczy.
 */
export function withCronAuth(handler: CronHandler) {
    return async (request: NextRequest): Promise<Response> => {
        const cronSecret = process.env.CRON_SECRET
        if (!cronSecret) {
            return NextResponse.json({ error: 'Not configured' }, { status: 503 })
        }

        const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
        const url = new URL(request.url)
        const querySecret = url.searchParams.get('secret')
        const provided = headerSecret || querySecret

        if (!provided || provided !== cronSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!headerSecret && querySecret) {
            logger.warn({
                event: 'cron.auth.query_param_fallback',
                path: url.pathname,
                msg: 'CRON_SECRET passed via query param — migrate caller to Authorization: Bearer header',
            })
        }

        const admin = createServiceClient()
        return handler(request, { admin })
    }
}

// ─── 2. withAuth — dla user-facing API routes ───────────────────────────

interface AuthContext {
    supabase: ReturnType<typeof createClient>
    user: { id: string; email: string | null }
    role: DbRole | null
}

type AuthHandler = (request: NextRequest, ctx: AuthContext) => Promise<Response> | Response

interface WithAuthOpts {
    /** Pojedyncza rola lub lista dozwolonych ról. Brak = każdy authenticated. */
    role?: DbRole | DbRole[]
}

/**
 * Wrap user-facing API route handler:
 *   - 401 jeśli nie zalogowany
 *   - 403 jeśli zalogowany ale wrong role (gdy `opts.role` ustawione)
 *   - Przekazuje `{ supabase, user, role }` do handlera
 *
 * Note: role fetch jest jednym query — analogicznie do middleware.ts profile fetch.
 * Per-request dedupe via React `cache` w lib/auth/getProfile, ale routes są
 * stateless (bez RSC env) więc tu surowe fetch.
 */
export function withAuth(handler: AuthHandler, opts: WithAuthOpts = {}) {
    return async (request: NextRequest): Promise<Response> => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let role: DbRole | null = null

        if (opts.role) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .maybeSingle()

            role = (profile?.role as DbRole | undefined) ?? null

            const allowed = Array.isArray(opts.role) ? opts.role : [opts.role]
            if (!role || !allowed.includes(role)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            }
        }

        return handler(request, {
            supabase,
            user: { id: user.id, email: user.email ?? null },
            role,
        })
    }
}
