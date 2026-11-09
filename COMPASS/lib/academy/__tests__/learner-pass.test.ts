import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const SECRET = 'a'.repeat(40)
const OTHER_SECRET = 'b'.repeat(40)
const ACCOUNT_ID = '11111111-2222-4333-8444-555555555555'
const OWNER = 'wlasciciel@gmail.test'

const state = vi.hoisted(() => ({
    account: null as Record<string, unknown> | null,
    claimRows: [{ id: 'x' }] as unknown[],
    updates: [] as Record<string, unknown>[],
    createUser: vi.fn(),
    getUserById: vi.fn(),
    generateLink: vi.fn(),
    deleteUser: vi.fn(),
    linkError: null as { code: string } | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        from: () => {
            const query = {
                select: () => query,
                eq: () => query,
                is: async () => ({ error: state.linkError }),
                or: () => ({ select: async () => ({ data: state.claimRows, error: null }) }),
                maybeSingle: async () => ({ data: state.account, error: null }),
                update: (patch: Record<string, unknown>) => { state.updates.push(patch); return query },
            }
            return query
        },
        auth: { admin: { createUser: state.createUser, getUserById: state.getUserById, generateLink: state.generateLink, deleteUser: state.deleteUser } },
    }),
}))

import { createLearnerPassToken, learnerPassSecret, LEARNER_PASS_TTL_SECONDS, LEARNER_REENTRY_TTL_SECONDS, verifyLearnerPassToken } from '../learner-pass'
import { CURRENT_LEARNER_INFO_VERSION } from '../learner-info'
import { maskLearnerEmail, resolveLearnerPass } from '../learner-entry'
import { POST } from '@/app/api/akademia/wejscie/[token]/route'
import { createServiceClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

const token = (overrides: { secret?: string; ttl?: number; now?: Date; purpose?: 'p' | 'r' } = {}) => createLearnerPassToken({
    accountId: ACCOUNT_ID, purpose: overrides.purpose ?? 'p', ttlSeconds: overrides.ttl ?? LEARNER_PASS_TTL_SECONDS, now: overrides.now,
}, overrides.secret ?? SECRET)
const client = () => createServiceClient() as unknown as SupabaseClient
const trial = () => ({ id: ACCOUNT_ID, email: OWNER, full_name: 'Właściciel', source: 'proba', user_id: null, info_accepted_at: null, info_version: null, first_login_at: null, last_entry_at: null, access_until: null, ended_at: null })

beforeEach(() => {
    vi.stubEnv('ACADEMY_PASS_SECRET', SECRET)
    vi.stubEnv('ACADEMY_MAIL_TEST_RECIPIENTS', OWNER)
    vi.stubEnv('ACADEMY_PASS_ENABLED', '')
    state.account = trial()
    state.claimRows = [{ id: 'x' }]
    state.updates = []
    state.linkError = null
    state.deleteUser.mockReset().mockResolvedValue({ error: null })
    state.createUser.mockReset().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
    state.getUserById.mockReset()
    state.generateLink.mockReset().mockResolvedValue({ data: { user: { id: 'new-user' }, properties: { hashed_token: 'hash' } }, error: null })
})

describe('token przepustki', () => {
    it('poprawny token przechodzi i nie niesie adresu', () => {
        const value = token()
        expect(value).not.toContain('@')
        expect(verifyLearnerPassToken(value, SECRET)).toMatchObject({ ok: true, claims: { accountId: ACCOUNT_ID, purpose: 'p' } })
    })

    it('zły podpis jest odrzucany', () => {
        expect(verifyLearnerPassToken(token({ secret: OTHER_SECRET }), SECRET)).toEqual({ ok: false, reason: 'bad_signature' })
    })

    it('zmiana celu, konta albo terminu psuje podpis', () => {
        const parts = token().split('.')
        const tampered = [
            [...parts.slice(0, 1), 'r', ...parts.slice(2)],
            [...parts.slice(0, 2), '99999999-2222-4333-8444-555555555555', ...parts.slice(3)],
            [...parts.slice(0, 4), '9999999999', ...parts.slice(5)],
        ]
        for (const value of tampered) expect(verifyLearnerPassToken(value.join('.'), SECRET)).toEqual({ ok: false, reason: 'bad_signature' })
    })

    it('wygasły link jest odrzucany, także co do sekundy', () => {
        const issued = new Date('2026-11-10T10:00:00Z')
        const value = token({ now: issued, ttl: LEARNER_REENTRY_TTL_SECONDS })
        expect(verifyLearnerPassToken(value, SECRET, new Date('2026-11-10T10:14:59Z')).ok).toBe(true)
        expect(verifyLearnerPassToken(value, SECRET, new Date('2026-11-10T10:15:00Z'))).toEqual({ ok: false, reason: 'expired' })
    })

    it('token z przyszłości jest odrzucany', () => {
        expect(verifyLearnerPassToken(token({ now: new Date('2030-01-01T00:00:00Z') }), SECRET, new Date('2026-11-10T10:00:00Z')))
            .toEqual({ ok: false, reason: 'not_yet_valid' })
    })

    it.each(['', 'abc', 'v2.p.x.1.2.y', `${'x'.repeat(201)}`, `${token()}/../x`])('odrzuca token o złym kształcie: %s', value => {
        expect(verifyLearnerPassToken(value, SECRET)).toEqual({ ok: false, reason: 'malformed' })
    })

    it('na produkcji sekret nie ma wartości zapasowej i musi być długi', () => {
        expect(learnerPassSecret({ NODE_ENV: 'production', CRON_SECRET: SECRET } as never)).toBeNull()
        expect(learnerPassSecret({ NODE_ENV: 'production', ACADEMY_PASS_SECRET: 'krotki' } as never)).toBeNull()
        expect(learnerPassSecret({ NODE_ENV: 'production', ACADEMY_PASS_SECRET: SECRET } as never)).toBe(SECRET)
    })
})

describe('resolveLearnerPass', () => {
    it('konto próbne na skrzynce właściciela przechodzi przy wyłączonym przełączniku', async () => {
        expect(await resolveLearnerPass(client(), token())).toMatchObject({ status: 'ok' })
    })

    it('niczego nie zapisuje', async () => {
        await resolveLearnerPass(client(), token())
        expect(state.updates).toEqual([])
        expect(state.createUser).not.toHaveBeenCalled()
        expect(state.generateLink).not.toHaveBeenCalled()
    })

    it.each([
        ['zły podpis', () => token({ secret: OTHER_SECRET })],
        ['wygasły link', () => token({ now: new Date('2026-01-01T00:00:00Z'), ttl: 60 })],
    ])('%s daje not_found', async (_name, make) => {
        expect(await resolveLearnerPass(client(), make())).toEqual({ status: 'not_found' })
    })

    it('adres domeny firmowej daje not_found, także przy włączonym przełączniku', async () => {
        vi.stubEnv('ACADEMY_PASS_ENABLED', 'true')
        state.account = { ...trial(), email: 'ktos@b2bnetwork.pl', source: 'umowa' }
        expect(await resolveLearnerPass(client(), token())).toEqual({ status: 'not_found' })
    })

    it('zwykłe konto przy wyłączonym przełączniku daje not_found', async () => {
        state.account = { ...trial(), email: 'uczestnik@example.test', source: 'umowa' }
        expect(await resolveLearnerPass(client(), token())).toEqual({ status: 'not_found' })
    })

    it('konto próbne spoza listy skrzynek daje not_found', async () => {
        state.account = { ...trial(), email: 'obcy@example.test' }
        expect(await resolveLearnerPass(client(), token())).toEqual({ status: 'not_found' })
    })

    it('brak konta i brak sekretu dają not_found', async () => {
        state.account = null
        expect(await resolveLearnerPass(client(), token())).toEqual({ status: 'not_found' })
        vi.stubEnv('ACADEMY_PASS_SECRET', '')
        vi.stubEnv('CRON_SECRET', '')
        state.account = trial()
        expect(await resolveLearnerPass(client(), token())).toEqual({ status: 'not_found' })
    })

    it('link wydany przed ostatnim wejściem jest zużyty', async () => {
        const issued = new Date('2026-11-10T10:00:00Z')
        state.account = { ...trial(), last_entry_at: '2026-11-10T10:05:00Z' }
        expect(await resolveLearnerPass(client(), token({ now: issued }), { now: new Date('2026-11-10T10:06:00Z') })).toEqual({ status: 'used' })
    })

    it('nowszy link po wcześniejszym wejściu działa', async () => {
        state.account = { ...trial(), last_entry_at: '2026-11-10T10:05:00Z' }
        const result = await resolveLearnerPass(client(), token({ now: new Date('2026-11-10T10:10:00Z') }), { now: new Date('2026-11-10T10:11:00Z') })
        expect(result.status).toBe('ok')
    })
})

describe('POST /api/akademia/wejscie/[token]', () => {
    const post = (value: string, body: unknown = { accepted: true, version: CURRENT_LEARNER_INFO_VERSION }) =>
        POST(new NextRequest(`https://compass.test/api/akademia/wejscie/${value}`, { method: 'POST', body: JSON.stringify(body) }), { params: { token: value } })

    it('zakłada konto ze znacznikiem i zwraca hash sesji', async () => {
        const response = await post(token())
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ tokenHash: 'hash' })
        expect(state.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: OWNER, email_confirm: true, app_metadata: { academy_only: true } }))
        expect(state.updates[0]).toMatchObject({ info_version: CURRENT_LEARNER_INFO_VERSION })
    })

    it.each([
        ['zły podpis', () => token({ secret: OTHER_SECRET })],
        ['wygasły link', () => token({ now: new Date('2026-01-01T00:00:00Z'), ttl: 60 })],
    ])('%s: 404 i bez konta', async (_name, make) => {
        expect((await post(make())).status).toBe(404)
        expect(state.createUser).not.toHaveBeenCalled()
        expect(state.updates).toEqual([])
    })

    it('adres domeny firmowej: 404 i bez konta', async () => {
        vi.stubEnv('ACADEMY_PASS_ENABLED', 'true')
        state.account = { ...trial(), email: 'ktos@b2bnetwork.pl', source: 'umowa' }
        expect((await post(token())).status).toBe(404)
        expect(state.createUser).not.toHaveBeenCalled()
        expect(state.generateLink).not.toHaveBeenCalled()
    })

    it('wyłączony przełącznik dla zwykłego konta: 404', async () => {
        state.account = { ...trial(), email: 'uczestnik@example.test', source: 'umowa' }
        expect((await post(token())).status).toBe(404)
        expect(state.createUser).not.toHaveBeenCalled()
    })

    it.each([[{}], [{ accepted: false, version: CURRENT_LEARNER_INFO_VERSION }], [{ accepted: 'true', version: CURRENT_LEARNER_INFO_VERSION }]])('bez zgody 400: %j', async body => {
        expect((await post(token(), body)).status).toBe(400)
        expect(state.updates).toEqual([])
    })

    it('stara wersja klauzuli: 409 i bez zapisu', async () => {
        expect((await post(token(), { accepted: true, version: 'starsza' })).status).toBe(409)
        expect(state.updates).toEqual([])
    })

    it('przegrany wyścig o link: 410 i bez konta', async () => {
        state.claimRows = []
        expect((await post(token())).status).toBe(410)
        expect(state.createUser).not.toHaveBeenCalled()
    })

    it('nie przejmuje konta bez znacznika', async () => {
        state.account = { ...trial(), user_id: 'staff' }
        state.getUserById.mockResolvedValue({ data: { user: { id: 'staff', email: OWNER, app_metadata: {} } }, error: null })
        expect((await post(token())).status).toBe(409)
        expect(state.generateLink).not.toHaveBeenCalled()
    })

    it('nie przejmuje konta o innym adresie', async () => {
        state.account = { ...trial(), user_id: 'u1' }
        state.getUserById.mockResolvedValue({ data: { user: { id: 'u1', email: 'inny@example.test', app_metadata: { academy_only: true } } }, error: null })
        expect((await post(token())).status).toBe(409)
        expect(state.generateLink).not.toHaveBeenCalled()
    })

    it('odmawia hasha sesji dla innego użytkownika niż konto', async () => {
        state.generateLink.mockResolvedValue({ data: { user: { id: 'cudzy' }, properties: { hashed_token: 'hash' } }, error: null })
        const response = await post(token())
        expect(response.status).toBe(503)
        expect(await response.json()).not.toHaveProperty('tokenHash')
    })

    it('nieudane powiązanie cofa założone konto', async () => {
        state.linkError = { code: '23505' }
        expect((await post(token())).status).toBe(503)
        expect(state.deleteUser).toHaveBeenCalledWith('new-user')
        expect(state.generateLink).not.toHaveBeenCalled()
    })

    it('adres istniejącego konta w Auth nie przejmuje go', async () => {
        state.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } })
        expect((await post(token())).status).toBe(409)
        expect(state.generateLink).not.toHaveBeenCalled()
    })
})

describe('maskLearnerEmail', () => {
    it('zostawia dwa znaki i domenę', () => {
        expect(maskLearnerEmail('janina@gmail.com')).toBe('ja***@gmail.com')
    })
})
