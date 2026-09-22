import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withCronAuth } from '@/lib/api/with-auth'
import { loadAcademyOperationsHealth } from '@/lib/academy/operations-health-server'

export const dynamic = 'force-dynamic'
/** Read-only watchdog: independent from workers, without writing its own heartbeat. */
export const GET = withCronAuth(async (_request, { admin }) => {
    try {
        const health = await loadAcademyOperationsHealth(admin as unknown as SupabaseClient)
        return NextResponse.json(health, { status: health.status === 'unhealthy' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
    } catch {
        return NextResponse.json({ status: 'unhealthy', error: 'health_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
})
