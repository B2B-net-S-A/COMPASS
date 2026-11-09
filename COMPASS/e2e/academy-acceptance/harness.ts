import type { APIRequestContext } from '@playwright/test'

// Pomocniki zestawu akceptacyjnego. Harness nie zna żadnego hasła: logować będzie się wyłącznie kontami
// próbnymi z etapu B1. Kroki admina i TCM wykonują ludzie przez SSO, a wynik wpisują w panelu Gotowość.
const ROUTE = '/api/internal/academy-readiness'

function secret(): string {
    const value = process.env.ACADEMY_READINESS_SECRET
    if (!value) throw new Error('Ustaw ACADEMY_READINESS_SECRET, sekret trasy wyników.')
    return value
}

export async function deployedSha(request: APIRequestContext): Promise<string> {
    const response = await request.get('/api/health')
    const body = await response.json() as { version?: string }
    if (!body.version || !/^[0-9a-f]{7,40}$/.test(body.version)) throw new Error('/api/health nie podaje SHA wdrożenia.')
    return body.version
}

export async function recordResult(request: APIRequestContext, scenarioId: string, status: 'passed' | 'failed'): Promise<void> {
    const sha = await deployedSha(request)
    const response = await request.post(ROUTE, { headers: { authorization: `Bearer ${secret()}` }, data: { scenario_id: scenarioId, sha, status } })
    if (!response.ok()) throw new Error(`Zapis wyniku ${scenarioId} odrzucony: ${response.status()}`)
}

export async function messagesOutsideList(request: APIRequestContext): Promise<number | null> {
    const response = await request.get(ROUTE, { headers: { authorization: `Bearer ${secret()}` } })
    if (!response.ok()) throw new Error(`Odczyt stanu odrzucony: ${response.status()}`)
    return ((await response.json()) as { messages_outside_list: number | null }).messages_outside_list
}
