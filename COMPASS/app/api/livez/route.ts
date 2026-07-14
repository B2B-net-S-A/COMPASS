import { getReleaseMetadata, NO_STORE_HEADERS } from '@/lib/health/contract'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
    const { version } = getReleaseMetadata()
    return Response.json(
        {
            status: 'alive',
            version,
        },
        { headers: NO_STORE_HEADERS },
    )
}
