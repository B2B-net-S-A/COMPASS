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

// ─── Budżet czasu i throttling ───────────────────────────────────────────────
//
// Konsumenci Graph to sekwencyjne pętle po ~37 skrzynkach (oof-reconcile,
// forward-reconcile, people-sync). Bez limitu czasu JEDNA zawieszona skrzynka
// zjada cały `maxDuration` trasy i przebieg ginie bez śladu — dokładnie ten
// wzorzec kazał w Fazie 41b przestawić kolejność w oof-reconcile. Twardy
// deadline sprawia, że koszt zawieszonej skrzynki to sekundy, nie cała trasa.

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
const MIN_REQUEST_TIMEOUT_MS = 1_000
const MAX_REQUEST_TIMEOUT_MS = 120_000

/** Bazowe opóźnienie (s) między ponowieniami 429/503/504 wewnątrz SDK. */
const RETRY_BASE_DELAY_SECONDS = 1
/**
 * Domyślnie SDK ponawia 3× z bazą 3 s. To mnoży się z pętlami retry po stronie
 * wywołujących (sender/graph-oof/graph-events/graph-inbox-rules mają własne
 * 3 podejścia), więc tutaj tniemy do 2 — Retry-After z odpowiedzi i tak jest
 * respektowany, a całość mieści się w deadlinie poniżej.
 */
const RETRY_MAX_ATTEMPTS = 2

export class GraphTimeoutError extends Error {
    readonly timeoutMs: number
    readonly path: string

    constructor(path: string, timeoutMs: number) {
        super(`Microsoft Graph: żądanie ${path} przekroczyło ${timeoutMs} ms.`)
        this.name = 'GraphTimeoutError'
        this.timeoutMs = timeoutMs
        this.path = path
    }
}

export function graphRequestTimeoutMs(): number {
    const raw = Number.parseInt(process.env.GRAPH_REQUEST_TIMEOUT_MS ?? '', 10)
    if (
        Number.isFinite(raw) &&
        raw >= MIN_REQUEST_TIMEOUT_MS &&
        raw <= MAX_REQUEST_TIMEOUT_MS
    ) {
        return raw
    }
    return DEFAULT_REQUEST_TIMEOUT_MS
}

/** Kształt żądania SDK, z którego korzystamy (plus metody konfiguracyjne). */
interface RawGraphRequest {
    get: () => Promise<unknown>
    post: (body: unknown) => Promise<unknown>
    patch: (body: unknown) => Promise<unknown>
    delete: () => Promise<unknown>
    select: (props: string) => RawGraphRequest
    responseType: (type: string) => RawGraphRequest
    options: (opts: Record<string, unknown>) => RawGraphRequest
    middlewareOptions: (opts: unknown[]) => RawGraphRequest
}

interface TimedGraphRequest {
    get: () => Promise<unknown>
    post: (body: unknown) => Promise<unknown>
    patch: (body: unknown) => Promise<unknown>
    delete: () => Promise<unknown>
    select: (props: string) => TimedGraphRequest
    responseType: (type: string) => TimedGraphRequest
}

/**
 * Odpala jedną operację Graph z twardym budżetem czasu.
 *
 * Budżet obejmuje też ponowienia robione wewnątrz SDK — `signal` jest jeden na
 * całe wywołanie, więc `Retry-After: 180` nie jest w stanie zatrzymać pętli po
 * skrzynkach. Błąd celowo NIE niesie `statusCode`: pętle retry po stronie
 * wywołujących pytają o niego przez `isRetryableGraphStatus`, więc zerwane
 * żądanie kończy się od razu, zamiast mnożyć czekanie.
 */
async function withDeadline<T>(
    path: string,
    run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const timeoutMs = graphRequestTimeoutMs()
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new GraphTimeoutError(path, timeoutMs))
        }, timeoutMs)
    })

    try {
        return await Promise.race([run(controller.signal), deadline])
    } finally {
        if (timer) clearTimeout(timer)
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
    // (edge runtime, builds that never touch mail/calendar).
    const [{ Client, RetryHandlerOptions }, { ClientSecretCredential }] = await Promise.all([
        import('@microsoft/microsoft-graph-client'),
        import('@azure/identity'),
    ])
    // @ts-expect-error -- isomorphic-fetch has no type declarations; only side-effect import for global fetch polyfill
    await import('isomorphic-fetch')

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
    const raw = Client.init({
        authProvider: async (done: (err: Error | null, token: string | null) => void) => {
            try {
                const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default')
                done(null, tokenResponse?.token ?? null)
            } catch (e) {
                done(e as Error, null)
            }
        },
    }) as unknown as { api: (path: string) => RawGraphRequest }

    // Świadome nadpisanie domyślnych ustawień RetryHandlera (3 podejścia, baza
    // 3 s). Przekazujemy je per żądanie, żeby nie przebudowywać całego łańcucha
    // middleware — pomyłka w nim wywala CAŁY ruch do Graph, a prod nie ma
    // stagingu, na którym dałoby się to złapać.
    const retryOptions = new RetryHandlerOptions(RETRY_BASE_DELAY_SECONDS, RETRY_MAX_ATTEMPTS)

    const wrap = (path: string, request: RawGraphRequest): TimedGraphRequest => {
        const prepared = (signal: AbortSignal): RawGraphRequest =>
            request.options({ signal }).middlewareOptions([retryOptions])

        return {
            get: () => withDeadline(path, (signal) => prepared(signal).get()),
            post: (body) => withDeadline(path, (signal) => prepared(signal).post(body)),
            patch: (body) => withDeadline(path, (signal) => prepared(signal).patch(body)),
            delete: () => withDeadline(path, (signal) => prepared(signal).delete()),
            select: (props) => wrap(path, request.select(props)),
            responseType: (type) => wrap(path, request.responseType(type)),
        }
    }

    _client = { api: (path: string) => wrap(path, raw.api(path)) }

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

/**
 * Audyt 2026-08: `headers` NIE jest zwykłym obiektem. GraphErrorHandler robi
 * `gError.headers = rawResponse.headers` (node_modules/@microsoft/microsoft-graph-client/
 * lib/src/GraphErrorHandler.js), czyli przypina surowy obiekt `Headers` z fetcha.
 * Odczyt przez `headers['retry-after']` zwracał więc ZAWSZE undefined i wszystkie
 * pętle ponowień (kalendarz, OOF, reguły skrzynki, wysyłka maili) cofały się do
 * własnego backoffu, ignorując `Retry-After: 180` przy throttlingu 429.
 *
 * Czytamy trzy kształty, bo SDK bywa też mockowany zwykłym obiektem w testach:
 * `Headers` (ma `.get`), `Map` i zwykły rekord. Nagłówki HTTP są case-insensitive,
 * więc rekord przeglądamy po znormalizowanym kluczu.
 */
function readHeader(headers: unknown, name: string): string | undefined {
    if (!headers || typeof headers !== 'object') return undefined
    const lower = name.toLowerCase()

    const getter = (headers as { get?: unknown }).get
    if (typeof getter === 'function') {
        const value = (getter as (k: string) => unknown).call(headers, lower)
        return typeof value === 'string' ? value : undefined
    }

    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
        if (key.toLowerCase() !== lower) continue
        if (typeof value === 'string') return value
        if (typeof value === 'number') return String(value)
        if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    }
    return undefined
}

export function extractGraphErrorInfo(err: unknown): GraphErrorInfo {
    if (typeof err !== 'object' || err === null) return {}
    const e = err as { statusCode?: unknown; headers?: unknown }
    const info: GraphErrorInfo = {}
    if (typeof e.statusCode === 'number') info.statusCode = e.statusCode
    const retryAfterRaw = readHeader(e.headers, 'retry-after')
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
