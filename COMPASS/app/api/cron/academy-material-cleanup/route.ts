import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { runAcademyMaterialCleanup } from '@/lib/academy/material-cleanup'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = withCronAuth(withCronHeartbeat('ACADEMY_MATERIAL_CLEANUP_RUN', async (_request, { admin }) => {
    try {
        const result = await runAcademyMaterialCleanup(admin as unknown as SupabaseClient)
        const ok = result.retry === 0 && result.failed === 0
        return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 503 })
    } catch {
        return NextResponse.json({ ok: false, error: 'material_cleanup_failed' }, { status: 503 })
    }
}))
