import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { runAcademyMaterialScan } from '@/lib/academy/material-scanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const GET = withCronAuth(withCronHeartbeat('ACADEMY_MATERIAL_SCAN_RUN', async (_request, { admin }) => {
    try {
        const result = await runAcademyMaterialScan(admin as unknown as SupabaseClient)
        const ok = result.configured && result.retry === 0
        return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 503 })
    } catch {
        return NextResponse.json({ ok: false, error: 'material_scan_failed' }, { status: 503 })
    }
}))
