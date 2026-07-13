import { getReleaseMetadata, NO_STORE_HEADERS } from '@/lib/health/contract'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
    return Response.json(
        {
            status: 'alive',
            ...getReleaseMetadata(),
        },
        { headers: NO_STORE_HEADERS },
    )
}
