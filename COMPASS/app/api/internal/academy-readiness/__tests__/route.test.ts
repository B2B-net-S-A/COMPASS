import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient, type MockSupabase } from '@/test/mocks/supabase'
import { GET, POST } from '../route'

let client: MockSupabase
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const SECRET = 'sekret-testowy'
const post = (body: unknown, token: string | null = SECRET) => new NextRequest('http://x/api/internal/academy-readiness', { method: 'POST', body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} })
const get = (token: string | null = SECRET) => new NextRequest('http://x/api/internal/academy-readiness', { headers: token ? { authorization: `Bearer ${token}` } : {} })
const good = { scenario_id: 'G01', sha: 'abc1234', status: 'passed' }

beforeEach(() => {
    vi.stubEnv('ACADEMY_READINESS_SECRET', SECRET)
    vi.stubEnv('ACADEMY_MAIL_TEST_RECIPIENTS', 'wlasciciel@example.test')
    client = createMockSupabaseClient({ tables: { academy_readiness_results: [], academy_outbox: [] } })
})
afterEach(() => vi.unstubAllEnvs())

describe('trasa harnessu: odmowy', () => {
    it('bez skonfigurowanego sekretu odpowiada 503, nie 401', async () => {
        vi.stubEnv('ACADEMY_READINESS_SECRET', '')
        expect((await POST(post(good))).status).toBe(503)
    })
    it.each([[null], ['zly-sekret']])('odrzuca token %s', async token => {
        expect((await POST(post(good, token))).status).toBe(401)
        expect((await GET(get(token))).status).toBe(401)
        expect(client._tables.academy_readiness_results).toHaveLength(0)
    })
    it.each([[{ ...good, sha: 'NIE-SHA' }], [{ ...good, status: 'open' }], [{ ...good, scenario_id: 'X1' }], [{ ...good, evidence: 'plik' }], [{ ...good, email: 'osoba@example.test' }]])('odrzuca ładunek %j', async body => {
        expect((await POST(post(body))).status).toBe(400)
    })
    it('nie zapisze wyniku scenariusza ręcznego', async () => {
        expect((await POST(post({ ...good, scenario_id: 'G04' }))).status).toBe(422)
    })
    it('nieznany scenariusz w dobrym formacie to 404', async () => {
        expect((await POST(post({ ...good, scenario_id: 'G99' }))).status).toBe(404)
    })
})

describe('trasa harnessu: zapis i odczyt', () => {
    it('zapisuje wynik automatu', async () => {
        expect((await POST(post(good))).status).toBe(200)
        expect(client._tables.academy_readiness_results[0]).toMatchObject({ scenario_id: 'G01', kind: 'automat', sha: 'abc1234', status: 'passed' })
    })
    it('pozwala unieważnić wynik ręczny', async () => {
        expect((await POST(post({ scenario_id: 'G04', sha: 'abc1234', status: 'stale' }))).status).toBe(200)
    })
    it('liczy wiadomości poza listą, bez zwracania adresów', async () => {
        client = createMockSupabaseClient({ tables: { academy_readiness_results: [], academy_outbox: [{ id: 1, recipient: 'Wlasciciel@example.test ', status: 'sent_test' }, { id: 2, recipient: 'ktos@example.test', status: 'sent' }, { id: 3, recipient: 'inny@example.test', status: 'held' }] } })
        const response = await GET(get())
        const body = await response.json()
        expect(body.messages_outside_list).toBe(1)
        expect(JSON.stringify(body)).not.toContain('example.test')
    })
    it('pusta lista skrzynek oznacza, że każda wysłana wiadomość jest poza listą', async () => {
        vi.stubEnv('ACADEMY_MAIL_TEST_RECIPIENTS', '')
        client = createMockSupabaseClient({ tables: { academy_readiness_results: [], academy_outbox: [{ id: 1, recipient: 'wlasciciel@example.test', status: 'sent_test' }] } })
        expect((await (await GET(get())).json()).messages_outside_list).toBe(1)
    })
})
