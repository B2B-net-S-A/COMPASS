import type { DependencyStatus } from './contract'

const DATABASE_TIMEOUT_MS = 2_000

export async function checkDatabase(
    env: NodeJS.ProcessEnv = process.env,
    fetchImpl: typeof fetch = fetch,
): Promise<DependencyStatus> {
    const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
    if (!baseUrl || !serviceRoleKey) return 'unhealthy'

    let endpoint: URL
    try {
        endpoint = new URL('/rest/v1/profiles?select=id&limit=1', baseUrl)
        if (endpoint.protocol !== 'https:' && endpoint.hostname !== '127.0.0.1' && endpoint.hostname !== 'localhost') {
            return 'unhealthy'
        }
    } catch {
        return 'unhealthy'
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DATABASE_TIMEOUT_MS)

    try {
        const response = await fetchImpl(endpoint, {
            method: 'GET',
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                Accept: 'application/json',
                Range: '0-0',
            },
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
        })

        return response.ok ? 'healthy' : 'unhealthy'
    } catch {
        return 'unhealthy'
    } finally {
        clearTimeout(timer)
    }
}
