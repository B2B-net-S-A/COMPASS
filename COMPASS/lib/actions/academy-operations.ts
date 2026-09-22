'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { academyAction, requireAcademyContext } from '@/lib/academy/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { loadAcademyOperationsHealth } from '@/lib/academy/operations-health-server'

export async function getAcademyOperationsHealth() {
    return academyAction('operations.health', async () => {
        await requireAcademyContext({ admin: true })
        return loadAcademyOperationsHealth(createServiceClient() as unknown as SupabaseClient)
    })
}
