export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUPABASE_TIMEOUT_MS = 2000

async function checkSupabase(): Promise<'healthy' | 'unhealthy'> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return 'unhealthy'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS)

    try {
        const response = await fetch(`${url}/rest/v1/?apikey=${key}`, {
            method: 'HEAD',
            signal: controller.signal,
        })
        return response.status < 500 ? 'healthy' : 'unhealthy'
    } catch {
        return 'unhealthy'
    } finally {
        clearTimeout(timer)
    }
}

export async function GET() {
    const supabase = await checkSupabase()
    const status = supabase === 'unhealthy' ? 'unhealthy' : 'healthy'

    return Response.json(
        {
            status,
            version: process.env.GIT_SHA ?? 'unknown',
            deployedAt: process.env.BUILT_AT ?? 'unknown',
            checks: {
                supabase,
            },
        },
        { status: status === 'unhealthy' ? 503 : 200 },
    )
}
