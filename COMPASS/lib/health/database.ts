import type { DependencyCheck } from './contract'
import { probeServiceDatabase } from '@/lib/supabase/admin'

export async function checkDatabase(): Promise<DependencyCheck> {
    const startedAt = Date.now()

    try {
        const healthy = await probeServiceDatabase()

        return {
            status: healthy ? 'healthy' : 'unhealthy',
            latencyMs: Math.max(0, Date.now() - startedAt),
            critical: true,
        }
    } catch {
        return {
            status: 'unhealthy',
            latencyMs: Math.max(0, Date.now() - startedAt),
            critical: true,
        }
    }
}
