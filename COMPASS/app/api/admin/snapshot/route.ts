import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import { computeKpiSnapshot } from '@/lib/admin/snapshot-metrics'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

// Disable Next.js route cache — snapshot is dynamic state, our own 30s TTL handles caching.
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Snapshot = {
    health: {
        status: 'healthy' | 'degraded' | 'unhealthy'
        version: string
        deployedAt: string
        checks: { database: 'healthy' | 'unhealthy' }
    }
    kpis: Awaited<ReturnType<typeof computeKpiSnapshot>>
    sentry_release: string | null
    generated_at: string
    auth_mode: 'token' | 'jwt'
    cached: boolean
}

let cachedSnapshot: { data: Omit<Snapshot, 'auth_mode' | 'cached'>; expiresAt: number } | null = null
const CACHE_TTL_MS = 30_000

function safeEquals(a: string, b: string): boolean {
    const ba = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
}

export async function GET(req: Request): Promise<Response> {
    // Auth: token-first, JWT super-admin fallback
    const tokenHeader = req.headers.get('x-snapshot-token')
    const expectedToken = process.env.SNAPSHOT_TOKEN ?? ''
    let authMode: Snapshot['auth_mode'] | null = null

    if (tokenHeader && expectedToken && safeEquals(tokenHeader, expectedToken)) {
        authMode = 'token'
    } else {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user && isSuperAdmin(user.email)) {
            authMode = 'jwt'
        }
    }

    if (!authMode) {
        return NextResponse.json(
            { error: 'Snapshot requires X-Snapshot-Token header or super-admin JWT' },
            { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
        )
    }

    // Cache check (independent of auth mode — same data either way)
    const now = Date.now()
    if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
        return NextResponse.json({ ...cachedSnapshot.data, auth_mode: authMode, cached: true })
    }

    // Use service-role client for counts (bypass RLS)
    const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        { auth: { persistSession: false } },
    )

    const startedAt = Date.now()
    let dbCheck: 'healthy' | 'unhealthy' = 'healthy'
    let kpis: Snapshot['kpis']

    try {
        kpis = await computeKpiSnapshot(serviceClient)
        if (Date.now() - startedAt > 5_000) {
            // very slow DB — degraded but not unhealthy
            dbCheck = 'healthy'
        }
    } catch {
        dbCheck = 'unhealthy'
        kpis = {
            profiles: { total: 0, active: 0 },
            contracts: { active: 0 },
            centrala: { benefit_declarations: 0, referrals: 0, equipment_requests: 0, invoices: 0 },
            audit_logs: { last_24h: 0 },
        }
    }

    const snapshotData: Omit<Snapshot, 'auth_mode' | 'cached'> = {
        health: {
            status: dbCheck === 'healthy' ? 'healthy' : 'unhealthy',
            version: process.env.GIT_SHA ?? 'unknown',
            deployedAt: process.env.BUILT_AT ?? 'unknown',
            checks: { database: dbCheck },
        },
        kpis,
        sentry_release: process.env.SENTRY_DSN ? (process.env.GIT_SHA ?? null) : null,
        generated_at: new Date().toISOString(),
    }

    cachedSnapshot = { data: snapshotData, expiresAt: now + CACHE_TTL_MS }

    return NextResponse.json({ ...snapshotData, auth_mode: authMode, cached: false })
}
