// Shared Microsoft Graph client. Single ClientSecretCredential singleton
// reused across email (sendMail), calendar (events), people (users/photo).
//
// Why a separate module: lib/email/sender.ts had its own getGraphClient
// initially because email was the only consumer. Adding calendar + people
// (PR2/PR4) means we need the SDK once per process, not three times.
// Keeping it here also lets sender.ts focus on email-specific logic.
//
// Auth: ClientSecretCredential with `.default` scope → app-only token. The
// Application permissions granted in Azure (Mail.Send, Calendars.ReadWrite,
// User.Read.All) determine what the token can actually access — see docs
// in docs/microsoft-graph-email-setup.md.

export interface GraphLike {
    api: (path: string) => {
        get: () => Promise<unknown>
        post: (body: unknown) => Promise<unknown>
        patch: (body: unknown) => Promise<unknown>
        delete: () => Promise<unknown>
        select: (props: string) => {
            get: () => Promise<unknown>
        }
        responseType: (type: string) => {
            get: () => Promise<unknown>
        }
    }
}

let _client: GraphLike | null = null

/**
 * Returns the shared Graph client. Throws if AZURE_TENANT_ID / AZURE_CLIENT_ID
 * / AZURE_CLIENT_SECRET are not configured — caller decides whether that
 * counts as fatal (email send) or graceful skip (calendar event side-effect).
 */
export async function getGraphClient(): Promise<GraphLike> {
    if (_client) return _client

    const tenantId = process.env.AZURE_TENANT_ID
    const clientId = process.env.AZURE_CLIENT_ID
    const clientSecret = process.env.AZURE_CLIENT_SECRET
    if (!tenantId || !clientId || !clientSecret) {
        throw new Error(
            'Microsoft Graph: AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET wymagane.',
        )
    }

    // Dynamic imports keep the SDK out of bundles that never use Graph
    // (Resend-only deploys before PR #68, edge runtime, etc.).
    const [{ Client }, { ClientSecretCredential }] = await Promise.all([
        import('@microsoft/microsoft-graph-client'),
        import('@azure/identity'),
    ])
    // @ts-expect-error -- isomorphic-fetch has no type declarations; only side-effect import for global fetch polyfill
    await import('isomorphic-fetch')

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
    _client = Client.init({
        authProvider: async (done: (err: Error | null, token: string | null) => void) => {
            try {
                const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default')
                done(null, tokenResponse?.token ?? null)
            } catch (e) {
                done(e as Error, null)
            }
        },
    }) as unknown as GraphLike

    return _client
}

/**
 * Microsoft Graph SDK errors expose `statusCode` and sometimes `headers`
 * (with `retry-after`). We pull both safely without trusting the shape.
 */
export interface GraphErrorInfo {
    statusCode?: number
    retryAfterMs?: number
}

export function extractGraphErrorInfo(err: unknown): GraphErrorInfo {
    if (typeof err !== 'object' || err === null) return {}
    const e = err as { statusCode?: unknown; headers?: Record<string, unknown> }
    const info: GraphErrorInfo = {}
    if (typeof e.statusCode === 'number') info.statusCode = e.statusCode
    const retryAfterRaw = e.headers?.['retry-after'] ?? e.headers?.['Retry-After']
    if (typeof retryAfterRaw === 'string') {
        const seconds = Number.parseInt(retryAfterRaw, 10)
        if (Number.isFinite(seconds) && seconds > 0) {
            info.retryAfterMs = seconds * 1000
        }
    }
    return info
}

export function isRetryableGraphStatus(status: number | undefined): boolean {
    if (status === undefined) return false
    return status === 429 || (status >= 500 && status < 600)
}
