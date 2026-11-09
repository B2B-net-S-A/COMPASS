import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const OWNER = 'wlasciciel@gmail.test'
const SECRET = 'a'.repeat(40)
const ACCOUNT_ID = '11111111-2222-4333-8444-555555555555'

const state = vi.hoisted(() => ({
    account: null as Record<string, unknown> | null,
    hold: vi.fn(),
    send: vi.fn(),
    auto: vi.fn(),
}))

vi.mock('@/lib/academy/outbound', () => ({
    ACADEMY_PERSONAL_LINK_PLACEHOLDER: '{{academy_personal_link}}',
    holdAcademyMail: state.hold,
    sendAcademyMailTest: state.send,
    sendAcademyAutoMail: state.auto,
    testRecipients: (env: NodeJS.ProcessEnv) => new Set((env.ACADEMY_MAIL_TEST_RECIPIENTS ?? '').split(',').filter(Boolean)),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        from: () => {
            const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.account, error: null }) }
            return query
        },
    }),
}))

import { POST } from '@/app/api/akademia/wejscie/request/route'
import { allowReentryRequest, clientIp, resetReentryRateLimit } from '../reentry-rate-limit'
import { verifyLearnerPassToken } from '../learner-pass'

let ipCounter = 0
const post = (email: unknown, ip = `10.0.0.${(ipCounter += 1)}`) => POST(new NextRequest('https://compass.test/api/akademia/wejscie/request', {
    method: 'POST', body: JSON.stringify({ email }), headers: { 'x-forwarded-for': ip },
}))
const trial = () => ({ id: ACCOUNT_ID, email: OWNER, source: 'proba', access_until: null, ended_at: null })

beforeEach(() => {
    resetReentryRateLimit()
    vi.stubEnv('ACADEMY_PASS_ENABLED', '')
    vi.stubEnv('ACADEMY_MAIL_TEST_RECIPIENTS', OWNER)
    vi.stubEnv('ACADEMY_PASS_SECRET', SECRET)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://compass.test')
    state.account = trial()
    state.hold.mockReset().mockResolvedValue({ status: 'held', id: 'row-1' })
    state.send.mockReset().mockResolvedValue({ status: 'sent_test' })
    state.auto.mockReset().mockResolvedValue({ status: 'sent' })
})

describe('przy wyłączonej przepustce', () => {
    it('adres spoza skrzynek właściciela dostaje 404, bez wiersza i wiadomości', async () => {
        state.account = { ...trial(), email: 'uczestnik@example.test', source: 'umowa' }
        expect((await post('uczestnik@example.test')).status).toBe(404)
        expect(state.hold).not.toHaveBeenCalled()
        expect(state.send).not.toHaveBeenCalled()
        expect(state.auto).not.toHaveBeenCalled()
    })

    it('niepoprawne dane dostają 404', async () => {
        expect((await post(123)).status).toBe(404)
    })

    it('konto próbne właściciela dostaje link', async () => {
        expect((await post(OWNER)).status).toBe(200)
        expect(state.hold).toHaveBeenCalledTimes(1)
        expect(state.send).toHaveBeenCalledTimes(1)
    })

    it('skrzynka właściciela bez konta nauki nie tworzy wiadomości', async () => {
        state.account = null
        expect((await post(OWNER)).status).toBe(200)
        expect(state.hold).not.toHaveBeenCalled()
    })
})

describe('wiadomość', () => {
    it('wiersz w kolejce nie zawiera tokenu, a link powstaje przy wysyłce i działa 15 minut', async () => {
        await post(OWNER)
        const held = state.hold.mock.calls[0][1]
        expect(held.html).toContain('{{academy_personal_link}}')
        expect(held.html).not.toContain('/wejdz/')
        const link = await state.send.mock.calls[0][1].personalLink()
        const token = link.split('/wejdz/')[1]
        const verified = verifyLearnerPassToken(token, SECRET)
        expect(verified).toMatchObject({ ok: true, claims: { accountId: ACCOUNT_ID, purpose: 'r' } })
        if (verified.ok) expect(verified.claims.expiresAt - verified.claims.issuedAt).toBe(15 * 60)
    })

    it('nie wysyła bez sekretu', async () => {
        vi.stubEnv('ACADEMY_PASS_SECRET', '')
        vi.stubEnv('CRON_SECRET', '')
        expect((await post(OWNER)).status).toBe(200)
        expect(state.hold).not.toHaveBeenCalled()
    })

    it('duplikat w tym samym oknie nie wysyła drugi raz', async () => {
        state.hold.mockResolvedValue({ status: 'duplicate' })
        await post(OWNER)
        expect(state.send).not.toHaveBeenCalled()
    })
})

describe('po włączeniu przepustki', () => {
    beforeEach(() => { vi.stubEnv('ACADEMY_PASS_ENABLED', 'true') })

    const answer = async (email: unknown) => {
        const response = await post(email)
        return { status: response.status, body: await response.json() }
    }

    it('odpowiedź jest ta sama niezależnie od wyniku', async () => {
        const known = await answer(OWNER)
        state.account = null
        const unknown = await answer('nieznany@example.test')
        const invalid = await answer(123)
        state.account = { ...trial(), email: 'ktos@b2bnetwork.pl', source: 'umowa' }
        const company = await answer('ktos@b2bnetwork.pl')
        expect(unknown).toEqual(known)
        expect(invalid).toEqual(known)
        expect(company).toEqual(known)
    })

    it('zwykłe konto idzie regułą automatyczną bramki, nie wysyłką testową', async () => {
        state.account = { ...trial(), email: 'uczestnik@example.test', source: 'umowa' }
        await post('uczestnik@example.test')
        expect(state.hold).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({
            kind: 'academy.reentry', recipient: 'uczestnik@example.test', batchId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }))
        expect(state.send).not.toHaveBeenCalled()
        expect(state.auto).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ id: 'row-1' }))
        const link = await state.auto.mock.calls[0][1].personalLink()
        expect(verifyLearnerPassToken(link.split('/wejdz/')[1], SECRET)).toMatchObject({ ok: true })
    })

    it('odpowiedź nie czeka na wysyłkę, więc czas nie zdradza konta', async () => {
        state.account = { ...trial(), email: 'uczestnik@example.test', source: 'umowa' }
        state.auto.mockReturnValue(new Promise(() => undefined))
        const response = await post('uczestnik@example.test')
        expect(response.status).toBe(200)
        expect(state.auto).toHaveBeenCalledTimes(1)
    })

    it('odrzucona wysyłka nie wywraca odpowiedzi', async () => {
        state.account = { ...trial(), email: 'uczestnik@example.test', source: 'umowa' }
        state.auto.mockRejectedValue(new Error('graph'))
        expect((await post('uczestnik@example.test')).status).toBe(200)
        await new Promise(resolve => setTimeout(resolve, 0))
    })

    it('skrzynka właściciela dalej dostaje wysyłkę testową, nie regułę', async () => {
        await post(OWNER)
        expect(state.send).toHaveBeenCalledTimes(1)
        expect(state.auto).not.toHaveBeenCalled()
    })

    it('duplikat w oknie 15 minut nie wysyła drugi raz', async () => {
        state.account = { ...trial(), email: 'uczestnik@example.test', source: 'umowa' }
        state.hold.mockResolvedValue({ status: 'duplicate' })
        await post('uczestnik@example.test')
        expect(state.auto).not.toHaveBeenCalled()
    })

    it.each([
        { ended_at: '2026-01-01T00:00:00Z' },
        { access_until: '2026-01-01T00:00:00Z' },
    ])('konto zakończone albo przeterminowane nie dostaje linku: %j', async patch => {
        state.account = { ...trial(), ...patch }
        expect((await post(OWNER)).status).toBe(200)
        expect(state.hold).not.toHaveBeenCalled()
    })

    it('adres domeny firmowej nie dostaje linku', async () => {
        state.account = { ...trial(), email: 'ktos@b2bnetwork.pl', source: 'umowa' }
        await post('ktos@b2bnetwork.pl')
        expect(state.hold).not.toHaveBeenCalled()
    })
})

describe('limity', () => {
    it('po trzech prośbach adres nie dostaje kolejnej wiadomości', async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) await post(OWNER)
        expect(state.hold).toHaveBeenCalledTimes(3)
        await post(OWNER)
        expect(state.hold).toHaveBeenCalledTimes(3)
    })

    it('limit na IP działa przy różnych adresach', () => {
        const now = 1_000_000
        for (let attempt = 0; attempt < 10; attempt += 1) expect(allowReentryRequest('1.1.1.1', `a${attempt}@example.test`, now)).toBe(true)
        expect(allowReentryRequest('1.1.1.1', 'kolejny@example.test', now)).toBe(false)
    })

    it('okno się resetuje po 15 minutach', () => {
        const now = 2_000_000
        for (let attempt = 0; attempt < 3; attempt += 1) allowReentryRequest('2.2.2.2', 'a@example.test', now)
        expect(allowReentryRequest('2.2.2.2', 'a@example.test', now)).toBe(false)
        expect(allowReentryRequest('2.2.2.2', 'a@example.test', now + 15 * 60 * 1000 + 1)).toBe(true)
    })

    it('zalew unikalnych adresów nie zeruje istniejących limitów', () => {
        const now = 3_000_000
        for (let attempt = 0; attempt < 3; attempt += 1) allowReentryRequest('3.3.3.3', 'cel@example.test', now)
        expect(allowReentryRequest('3.3.3.3', 'cel@example.test', now)).toBe(false)
        for (let index = 0; index < 11_000; index += 1) allowReentryRequest(`4.0.0.${index}`, `u${index}@example.test`, now)
        expect(allowReentryRequest('3.3.3.3', 'cel@example.test', now)).toBe(false)
    })

    it('pełna tabela nie odmawia nowemu użytkownikowi, nawet przy podrobionych nagłówkach', () => {
        const now = 4_000_000
        for (let index = 0; index < 11_000; index += 1) allowReentryRequest(`podrobiony-${index}`, `zalew-${index}@example.test`, now)
        expect(allowReentryRequest('5.5.5.5', 'prawdziwy@example.test', now)).toBe(true)
    })

    it('zalew nie usuwa adresu, który wyczerpał limit', () => {
        const now = 5_000_000
        for (let attempt = 0; attempt < 4; attempt += 1) allowReentryRequest(`6.6.7.${attempt}`, 'wyczerpany@example.test', now)
        for (let index = 0; index < 11_000; index += 1) allowReentryRequest(`7.0.0.${index}`, `zalew-${index}@example.test`, now)
        expect(allowReentryRequest('6.6.8.1', 'wyczerpany@example.test', now)).toBe(false)
    })

    it('adresy nie wypychają limitów IP', () => {
        const now = 6_000_000
        for (let attempt = 0; attempt < 11; attempt += 1) allowReentryRequest('8.8.8.8', `limit-${attempt}@example.test`, now)
        for (let index = 0; index < 11_000; index += 1) allowReentryRequest(`9.0.0.${index}`, `zalew-${index}@example.test`, now)
        expect(allowReentryRequest('8.8.8.8', 'nowy@example.test', now)).toBe(false)
    })

    it('zablokowane IP nie zużywa limitu cudzego adresu', () => {
        const now = 7_000_000
        for (let attempt = 0; attempt < 10; attempt += 1) allowReentryRequest('1.2.3.4', `inny-${attempt}@example.test`, now)
        for (let attempt = 0; attempt < 5; attempt += 1) expect(allowReentryRequest('1.2.3.4', 'ofiara@example.test', now)).toBe(false)
        expect(allowReentryRequest('4.3.2.1', 'ofiara@example.test', now)).toBe(true)
    })

    it('czyta IP z nagłówka Cloudflare, potem z pierwszego wpisu listy', () => {
        expect(clientIp(new Headers({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9')
        expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1')
        expect(clientIp(new Headers())).toBe('unknown')
    })
})
