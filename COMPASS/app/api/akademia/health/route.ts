import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAcademyOperationsHealth } from '@/lib/academy/operations-health-server'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type PublicStatus = 'healthy' | 'degraded' | 'unhealthy'
const CACHE_MS = 30_000
let cached: { status: PublicStatus; expiresAt: number } | null = null
let inFlight: Promise<PublicStatus> | null = null

// The detailed report stays behind /api/cron/academy-health. This route exposes
// only its coarse result, and coalesces simultaneous public probes per process.
async function getStatus(): Promise<PublicStatus> {
    if (cached && Date.now() < cached.expiresAt) return cached.status
    if (!inFlight) {
        inFlight = (async () => {
            try {
                const health = await loadAcademyOperationsHealth(createServiceClient() as unknown as SupabaseClient)
                return health.status
            } catch {
                return 'unhealthy'
            }
        })()
    }
    try {
        const status = await inFlight
        cached = { status, expiresAt: Date.now() + CACHE_MS }
        return status
    } finally {
        inFlight = null
    }
}

export async function GET() {
    const status = await getStatus()
    return NextResponse.json(
        { status },
        { status: status === 'unhealthy' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
    )
}
