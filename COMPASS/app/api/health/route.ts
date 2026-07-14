import {
    deriveReadinessStatus,
    getReleaseMetadata,
    hasValidReleaseMetadata,
    NO_STORE_HEADERS,
} from '@/lib/health/contract'
import { checkDatabase } from '@/lib/health/database'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
    const metadata = getReleaseMetadata()
    const database = await checkDatabase()
    const release = {
        status: hasValidReleaseMetadata(metadata) ? 'healthy' as const : 'unhealthy' as const,
        critical: true,
    }
    const status = deriveReadinessStatus([database.status, release.status])

    return Response.json(
        {
            status,
            ...metadata,
            checks: {
                database,
                // Compatibility alias for one release. New consumers must use checks.database.
                supabase: database,
                release,
            },
        },
        {
            status: status === 'unhealthy' ? 503 : 200,
            headers: NO_STORE_HEADERS,
        },
    )
}
