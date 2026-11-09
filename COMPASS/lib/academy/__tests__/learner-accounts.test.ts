import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))

import { findLearnerAccountByEmail, findLearnerAccountById, isCompanyEmail, learnerEntryDenial } from '../learner-accounts'

const OWNER = 'wlasciciel@gmail.test'
const env = (extra: Record<string, string> = {}) => ({ ACADEMY_MAIL_TEST_RECIPIENTS: `${OWNER}, drugi@onet.test`, ...extra }) as unknown as NodeJS.ProcessEnv
const trial = { email: OWNER, source: 'proba', access_until: null, ended_at: null }
const contract = { email: 'uczestnik@example.test', source: 'umowa', access_until: null, ended_at: null }

describe('learnerEntryDenial', () => {
    it('przy wyłączonym przełączniku wpuszcza konto próbne na skrzynce właściciela', () => {
        expect(learnerEntryDenial(trial, { env: env() })).toBeNull()
    })

    it('przy wyłączonym przełączniku odmawia zwykłemu kontu, nawet na skrzynce właściciela', () => {
        expect(learnerEntryDenial(contract, { env: env() })).toBe('pass_disabled')
        expect(learnerEntryDenial({ ...contract, email: OWNER }, { env: env() })).toBe('pass_disabled')
    })

    it('tylko dosłowne true włącza przepustkę', () => {
        for (const value of ['1', 'TRUE', 'yes', '']) {
            expect(learnerEntryDenial(contract, { env: env({ ACADEMY_PASS_ENABLED: value }) })).toBe('pass_disabled')
        }
        expect(learnerEntryDenial(contract, { env: env({ ACADEMY_PASS_ENABLED: 'true' }) })).toBeNull()
    })

    it('konto próbne spoza listy skrzynek odpada także przy włączonym przełączniku', () => {
        const other = { ...trial, email: 'obcy@example.test' }
        expect(learnerEntryDenial(other, { env: env() })).toBe('not_owner_mailbox')
        expect(learnerEntryDenial(other, { env: env({ ACADEMY_PASS_ENABLED: 'true' }) })).toBe('not_owner_mailbox')
        expect(learnerEntryDenial(trial, { env: {} as NodeJS.ProcessEnv })).toBe('not_owner_mailbox')
    })

    it.each(['ktos@b2bnetwork.pl', 'KTOS@B2BNETWORK.PL', ' ktos@b2bnetwork.pl '])('odmawia adresowi firmowemu %s', email => {
        expect(learnerEntryDenial({ ...contract, email }, { env: env({ ACADEMY_PASS_ENABLED: 'true' }) })).toBe('company_domain')
    })

    it('odmawia adresowi spoza ASCII', () => {
        expect(learnerEntryDenial({ ...contract, email: 'a@b2bnetworK.pl' }, { env: env({ ACADEMY_PASS_ENABLED: 'true' }) })).not.toBeNull()
        expect(learnerEntryDenial({ ...contract, email: 'zażółć@example.test' }, { env: env({ ACADEMY_PASS_ENABLED: 'true' }) })).toBe('invalid_email')
    })

    it('odmawia kontu zakończonemu i przeterminowanemu', () => {
        const now = new Date('2026-12-01T10:00:00Z')
        const on = env({ ACADEMY_PASS_ENABLED: 'true' })
        expect(learnerEntryDenial({ ...contract, ended_at: '2026-11-30T10:00:00Z' }, { env: on, now })).toBe('ended')
        expect(learnerEntryDenial({ ...contract, access_until: '2026-12-01T10:00:00Z' }, { env: on, now })).toBe('expired')
        expect(learnerEntryDenial({ ...contract, access_until: '2026-12-01T10:00:01Z' }, { env: on, now })).toBeNull()
    })

    it('rozpoznaje adres firmowy bez względu na wielkość liter', () => {
        expect(isCompanyEmail('A@B2BNetwork.PL')).toBe(true)
        expect(isCompanyEmail('a@b2bnetwork.pl.evil.test')).toBe(false)
    })
})

function clientReturning(result: { data: unknown; error: unknown }) {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => result }
    return { from: () => query } as unknown as SupabaseClient
}

describe('odczyt konta', () => {
    it.each(['42P01', 'PGRST205', '42703', 'PGRST204'])('brak obiektu %s to brak konta, nie awaria', async code => {
        await expect(findLearnerAccountById(clientReturning({ data: null, error: { code } }), 'x')).resolves.toBeNull()
    })

    it('inny błąd bazy nie udaje braku konta', async () => {
        await expect(findLearnerAccountByEmail(clientReturning({ data: null, error: { code: '57014' } }), 'a@example.test')).rejects.toThrow('read failed')
    })
})
