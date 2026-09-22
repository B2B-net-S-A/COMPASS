import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertClamavReadiness } from './clamav-readiness'
import { academyScannerConfiguration } from './material-scanner'
import { evaluateAcademyOperations, operationsSnapshotSchema } from './operations-health'

/** Only call with a service client after an admin or cron authorization guard. */
export async function loadAcademyOperationsHealth(client: SupabaseClient) {
    const { data, error } = await client.rpc('academy_operations_health')
    if (error) throw new Error('academy_operations_health_unavailable')
    const snapshot = operationsSnapshotSchema.parse(data)
    const config = academyScannerConfiguration()
    let databaseUpdatedAt: string | null = null
    if (config) {
        try { databaseUpdatedAt = (await assertClamavReadiness(config)).databaseUpdatedAt } catch { /* A failed readiness probe is an explicit warning. */ }
    }
    return evaluateAcademyOperations(snapshot, { available: databaseUpdatedAt !== null, databaseUpdatedAt })
}
