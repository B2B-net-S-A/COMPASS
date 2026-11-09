import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from '@/lib/email/sender'
import {
    ACADEMY_PERSONAL_LINK_PLACEHOLDER,
    academySenderOverride,
    approveAcademyOutboxBatch,
    holdAcademyMail,
    runAcademyOutboxHousekeeping,
    sendAcademyMailTest,
    sendApprovedAcademyBatch,
} from '../outbound'

vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

type Row = Record<string, unknown>
type DbError = { code: string; message: string }

const NOW = new Date('2026-11-09T12:00:00Z')
const FUTURE = '2026-11-16T12:00:00.000Z'
const PAST = '2026-11-08T12:00:00.000Z'
const BATCH = '00000000-0000-4000-8000-00000000000b'
const ACTOR = '00000000-0000-4000-8000-00000000000a'
const ON = { ACADEMY_MAIL_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv
const OFF = {} as NodeJS.ProcessEnv

/** Pamięciowa atrapa tabeli academy_outbox: tyle PostgREST, ile używa bramka. */
function fakeDb(seed: Row[] = [], failures: Partial<Record<'insert' | 'update' | 'delete' | 'select', DbError>> = {}) {
    const rows = seed.map(row => ({ ...row }))
    const client = {
        from(table: string) {
            expect(table).toBe('academy_outbox')
            const filters: Array<(row: Row) => boolean> = []
            let operation: 'select' | 'update' | 'delete' = 'select'
            let patch: Row = {}
            const builder = {
                select: () => builder,
                limit: () => builder,
                eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder },
                in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder },
                is: (column: string, value: unknown) => { filters.push(row => (row[column] ?? null) === value); return builder },
                lte: (column: string, value: string) => { filters.push(row => String(row[column]) <= value); return builder },
                lt: (column: string, value: string) => { filters.push(row => String(row[column]) < value); return builder },
                gt: (column: string, value: string) => { filters.push(row => String(row[column]) > value); return builder },
                update: (values: Row) => { operation = 'update'; patch = values; return builder },
                delete: () => { operation = 'delete'; return builder },
                insert: (row: Row) => ({
                    select: () => ({
                        single: async () => {
                            if (failures.insert) return { data: null, error: failures.insert }
                            if (rows.some(existing => existing.dedupe_key === row.dedupe_key)) return { data: null, error: { code: '23505', message: 'duplicate' } }
                            const stored = { id: `row-${rows.length + 1}`, status: 'held', claimed_at: null, ...row }
                            rows.push(stored)
                            return { data: { id: stored.id }, error: null }
                        },
                    }),
                }),
                maybeSingle: async () => {
                    if (failures.select) return { data: null, error: failures.select }
                    return { data: rows.find(row => filters.every(filter => filter(row))) ?? null, error: null }
                },
                then(resolve: (value: { data: Row[] | null; error: DbError | null }) => unknown) {
                    const matched = rows.filter(row => filters.every(filter => filter(row)))
                    if (operation === 'update') {
                        if (failures.update) return Promise.resolve(resolve({ data: null, error: failures.update }))
                        matched.forEach(row => Object.assign(row, patch))
                    } else if (operation === 'delete') {
                        if (failures.delete) return Promise.resolve(resolve({ data: null, error: failures.delete }))
                        matched.forEach(row => rows.splice(rows.indexOf(row), 1))
                    } else if (failures.select) {
                        return Promise.resolve(resolve({ data: null, error: failures.select }))
                    }
                    return Promise.resolve(resolve({ data: matched.map(row => ({ ...row })), error: null }))
                },
            }
            return builder
        },
    }
    return { rows, client: client as unknown as SupabaseClient }
}

const row = (overrides: Row = {}): Row => ({
    id: 'row-1', kind: 'test', recipient: 'osoba@example.test', subject: 'Temat', html: '<p>Treść</p>', batch_id: BATCH,
    status: 'held', expires_at: FUTURE, dedupe_key: 'k1', claimed_at: null, ...overrides,
})
const held = (count: number) => Array.from({ length: count }, (_, index) => row({ id: `row-${index}`, dedupe_key: `k${index}`, recipient: `osoba${index}@example.test` }))
const message = (overrides: Partial<Parameters<typeof holdAcademyMail>[1]> = {}) => ({
    kind: 'test', recipient: 'Osoba@Example.test ', subject: 'Temat', html: '<p>Treść</p>', expiresAt: FUTURE, dedupeKey: 'nowy', ...overrides,
})

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.mocked(sendEmail).mockResolvedValue({ success: true })
})

describe('wstrzymanie wiadomości', () => {
    it('przy domyślnych przełącznikach tworzy wiersz held i nie dotyka poczty', async () => {
        const { client, rows } = fakeDb()
        expect(await holdAcademyMail(client, message())).toEqual({ status: 'held', id: 'row-1' })
        expect(rows[0]).toMatchObject({ status: 'held', recipient: 'osoba@example.test', dedupe_key: 'nowy' })
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('przy włączonym przełączniku też tylko wstrzymuje', async () => {
        vi.stubEnv('ACADEMY_MAIL_ENABLED', 'true')
        const { client, rows } = fakeDb()
        await holdAcademyMail(client, message())
        expect(rows[0].status).toBe('held')
        expect(sendEmail).not.toHaveBeenCalled()
        vi.unstubAllEnvs()
    })

    it('duplikat klucza nie tworzy drugiego wiersza i nie jest awarią', async () => {
        const { client, rows } = fakeDb([row({ dedupe_key: 'nowy' })])
        expect(await holdAcademyMail(client, message())).toEqual({ status: 'duplicate' })
        expect(rows).toHaveLength(1)
        expect(Sentry.captureMessage).not.toHaveBeenCalled()
    })

    it.each([
        ['PGRST205', 'migration_pending'],
        ['42P01', 'migration_pending'],
        ['42703', 'migration_pending'],
        ['08006', 'write_failed'],
    ])('błąd zapisu %s oznacza brak wysyłki i zdarzenie w Sentry', async (code, reason) => {
        const { client } = fakeDb([], { insert: { code, message: 'osoba@example.test nie zapisano' } })
        expect(await holdAcademyMail(client, message())).toEqual({ status: 'refused', reason })
        expect(sendEmail).not.toHaveBeenCalled()
        expect(Sentry.captureMessage).toHaveBeenCalledOnce()
        expect(JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls)).not.toContain('osoba@')
    })

    it('wyjątek klienta bazy też oznacza brak wysyłki', async () => {
        const client = { from: () => { throw new Error('siec') } } as unknown as SupabaseClient
        expect(await holdAcademyMail(client, message())).toEqual({ status: 'refused', reason: 'write_failed' })
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it.each([
        ['token w adresie', { html: '<a href="https://x.test/a?token=abc">x</a>' }],
        ['osobisty link przepustki', { html: '<a href="https://x.test/wejdz/abcdefghijkl">x</a>' }],
        ['token w temacie', { subject: 'Link ?access_token=abc' }],
    ])('odrzuca %s, bo wiersz nie może nieść tokenu', async (_name, overrides) => {
        const { client, rows } = fakeDb()
        expect(await holdAcademyMail(client, message(overrides))).toEqual({ status: 'refused', reason: 'token_in_body' })
        expect(rows).toHaveLength(0)
    })

    it('przepuszcza znacznik osobistego linku', async () => {
        const { client } = fakeDb()
        expect((await holdAcademyMail(client, message({ html: `<a href="${ACADEMY_PERSONAL_LINK_PLACEHOLDER}">x</a>` }))).status).toBe('held')
    })

    it.each([
        ['termin w przeszłości', { expiresAt: PAST }, 'past_due'],
        ['termin nie jest datą', { expiresAt: 'jutro' }, 'invalid'],
        ['niepoprawny adres', { recipient: 'bez-malpy' }, 'invalid'],
        ['pusty klucz', { dedupeKey: ' ' }, 'invalid'],
    ])('odrzuca %s bez zapisu', async (_name, overrides, reason) => {
        const { client, rows } = fakeDb()
        expect(await holdAcademyMail(client, message(overrides))).toEqual({ status: 'refused', reason })
        expect(rows).toHaveLength(0)
        expect(sendEmail).not.toHaveBeenCalled()
    })
})

describe('włączenie przełącznika nie opróżnia kolejki', () => {
    it.each([1, 10, 500])('przy %i wstrzymanych wysyła 0', async count => {
        vi.stubEnv('ACADEMY_MAIL_ENABLED', 'true')
        const { client, rows } = fakeDb(held(count))
        await holdAcademyMail(client, message({ dedupeKey: 'jeszcze-jeden' }))
        await runAcademyOutboxHousekeeping(client)
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH })).toEqual({ status: 'done', sent: 0, failed: 0, skipped: 0 })
        expect(sendEmail).toHaveBeenCalledTimes(0)
        expect(rows.filter(item => item.status === 'held')).toHaveLength(count + 1)
        vi.unstubAllEnvs()
    })
})

describe('zatwierdzenie paczki', () => {
    it('jest nieaktywne bez przełącznika i niczego nie zmienia', async () => {
        const { client, rows } = fakeDb(held(2))
        expect(await approveAcademyOutboxBatch(client, { batchId: BATCH, approvedBy: ACTOR, env: OFF })).toEqual({ status: 'refused', reason: 'mail_disabled' })
        expect(rows.every(item => item.status === 'held')).toBe(true)
    })

    it('wymaga wskazania zatwierdzającego człowieka', async () => {
        const { client, rows } = fakeDb(held(1))
        expect(await approveAcademyOutboxBatch(client, { batchId: BATCH, approvedBy: 'cron', env: ON })).toEqual({ status: 'refused', reason: 'invalid' })
        expect(rows[0].status).toBe('held')
    })

    it('zatwierdza tylko wiersze tej paczki przed terminem', async () => {
        const { client, rows } = fakeDb([row(), row({ id: 'inna', dedupe_key: 'k2', batch_id: 'inna-paczka' }), row({ id: 'stara', dedupe_key: 'k3', expires_at: PAST })])
        expect(await approveAcademyOutboxBatch(client, { batchId: BATCH, approvedBy: ACTOR, env: ON })).toEqual({ status: 'approved', count: 1 })
        expect(rows.map(item => item.status)).toEqual(['approved', 'held', 'held'])
        expect(rows[0]).toMatchObject({ approved_by: ACTOR, approved_at: NOW.toISOString() })
    })
})

describe('wysyłka zatwierdzonej paczki', () => {
    const approved = (overrides: Row = {}) => row({ status: 'approved', approved_by: ACTOR, ...overrides })

    it('bez przełącznika nie wysyła także zatwierdzonych wierszy', async () => {
        const { client, rows } = fakeDb([approved()])
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH, env: OFF })).toEqual({ status: 'refused', reason: 'mail_disabled' })
        expect(sendEmail).not.toHaveBeenCalled()
        expect(rows[0].status).toBe('approved')
    })

    it('wysyła zatwierdzony wiersz i zapisuje wynik', async () => {
        const { client, rows } = fakeDb([approved()])
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON })).toEqual({ status: 'done', sent: 1, failed: 0, skipped: 0 })
        expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ to: 'osoba@example.test', redactRecipientInLogs: true }))
        expect(rows[0]).toMatchObject({ status: 'sent', sent_at: NOW.toISOString(), claimed_at: NOW.toISOString() })
    })

    it('nie wysyła wiersza po terminie i oznacza go jako expired', async () => {
        const { client, rows } = fakeDb([approved({ expires_at: PAST })])
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON })).toEqual({ status: 'done', sent: 0, failed: 0, skipped: 0 })
        expect(sendEmail).not.toHaveBeenCalled()
        expect(rows[0].status).toBe('expired')
    })

    it('nie wysyła drugi raz wiersza już przejętego', async () => {
        const { client } = fakeDb([approved({ claimed_at: PAST })])
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON })).toEqual({ status: 'done', sent: 0, failed: 0, skipped: 0 })
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('nie wysyła, gdy nie udało się przejąć wiersza', async () => {
        const { client } = fakeDb([approved()], { update: { code: '08006', message: 'brak' } })
        const result = await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON })
        expect(result).toEqual({ status: 'refused', reason: 'write_failed' })
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('błąd poczty oznacza wiersz jako failed bez adresu w błędzie', async () => {
        vi.mocked(sendEmail).mockResolvedValue({ success: false, error: 'osoba@example.test odrzucony' })
        const { client, rows } = fakeDb([approved()])
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON })).toEqual({ status: 'done', sent: 0, failed: 1, skipped: 0 })
        expect(rows[0]).toMatchObject({ status: 'failed', last_error: 'send_failed' })
    })

    it('osobisty link powstaje dopiero w chwili wysyłki', async () => {
        const { client, rows } = fakeDb([approved({ html: `<a href="${ACADEMY_PERSONAL_LINK_PLACEHOLDER}">x</a>` })])
        await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON, personalLink: async () => 'https://x.test/wejdz/sekret-tokenu' })
        expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ html: '<a href="https://x.test/wejdz/sekret-tokenu">x</a>' }))
        expect(String(rows[0].html)).toContain(ACADEMY_PERSONAL_LINK_PLACEHOLDER)
    })

    it('bez generatora linku nie wysyła wiadomości ze znacznikiem', async () => {
        const { client, rows } = fakeDb([approved({ html: `<a href="${ACADEMY_PERSONAL_LINK_PLACEHOLDER}">x</a>` })])
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON })).toEqual({ status: 'done', sent: 0, failed: 1, skipped: 0 })
        expect(sendEmail).not.toHaveBeenCalled()
        expect(rows[0]).toMatchObject({ status: 'failed', last_error: 'personal_link_unavailable' })
    })

    it.each(['PGRST205', '42P01'])('brak tabeli (%s) nie wysyła niczego', async code => {
        const { client } = fakeDb([], { select: { code, message: 'missing' } })
        expect(await sendApprovedAcademyBatch(client, { batchId: BATCH, env: ON })).toEqual({ status: 'refused', reason: 'migration_pending' })
        expect(sendEmail).not.toHaveBeenCalled()
        expect(Sentry.captureMessage).toHaveBeenCalledOnce()
    })
})

describe('wysyłka testowa', () => {
    const env = { ACADEMY_MAIL_TEST_RECIPIENTS: ' "Wlasciciel@Example.test", drugi@example.test' } as unknown as NodeJS.ProcessEnv
    const own = (overrides: Row = {}) => row({ recipient: 'wlasciciel@example.test', ...overrides })

    it('idzie na adres z listy właściciela mimo wyłączonego przełącznika', async () => {
        const { client, rows } = fakeDb([own()])
        expect(await sendAcademyMailTest(client, { id: 'row-1', env })).toEqual({ status: 'sent_test' })
        expect(sendEmail).toHaveBeenCalledOnce()
        expect(rows[0].status).toBe('sent_test')
    })

    it.each([
        ['adres spoza listy', row(), env],
        ['pusta lista', own(), {} as NodeJS.ProcessEnv],
        ['wiersz zatwierdzony', own({ status: 'approved' }), env],
        ['wiersz po wysyłce', own({ status: 'sent_test' }), env],
    ])('odmawia: %s', async (_name, seed, testEnv) => {
        const { client, rows } = fakeDb([seed])
        const before = rows[0].status
        expect((await sendAcademyMailTest(client, { id: 'row-1', env: testEnv })).status).toBe('refused')
        expect(sendEmail).not.toHaveBeenCalled()
        expect(rows[0].status).toBe(before)
    })

    it('nie wysyła wiersza po terminie', async () => {
        const { client, rows } = fakeDb([own({ expires_at: PAST })])
        expect(await sendAcademyMailTest(client, { id: 'row-1', env })).toEqual({ status: 'refused', reason: 'past_due' })
        expect(sendEmail).not.toHaveBeenCalled()
        expect(rows[0].status).toBe('held')
    })

    it('brak tabeli nie wysyła niczego', async () => {
        const { client } = fakeDb([], { select: { code: 'PGRST205', message: 'missing' } })
        expect(await sendAcademyMailTest(client, { id: 'row-1', env })).toEqual({ status: 'refused', reason: 'migration_pending' })
        expect(sendEmail).not.toHaveBeenCalled()
    })
})

describe('porządki w kolejce', () => {
    it('wiersz held po terminie przechodzi w expired, a przed terminem zostaje', async () => {
        const { client, rows } = fakeDb([row({ expires_at: PAST }), row({ id: 'r2', dedupe_key: 'k2' }), row({ id: 'r3', dedupe_key: 'k3', status: 'approved', expires_at: PAST })])
        expect(await runAcademyOutboxHousekeeping(client)).toEqual({ status: 'done', expired: 2, purged: 0 })
        expect(rows.map(item => item.status)).toEqual(['expired', 'held', 'expired'])
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it('usuwa tylko wiersze końcowe starsze niż retencja, nigdy held', async () => {
        const old = '2026-09-01T00:00:00.000Z'
        const { client, rows } = fakeDb([
            row({ id: 'a', dedupe_key: 'a', status: 'expired', expires_at: old }),
            row({ id: 'b', dedupe_key: 'b', status: 'sent', expires_at: old }),
            row({ id: 'c', dedupe_key: 'c', status: 'expired', expires_at: PAST }),
            row({ id: 'd', dedupe_key: 'd', status: 'held', expires_at: FUTURE }),
        ])
        expect(await runAcademyOutboxHousekeeping(client)).toEqual({ status: 'done', expired: 0, purged: 2 })
        expect(rows.map(item => item.id)).toEqual(['c', 'd'])
    })

    it('brak tabeli nie jest awarią', async () => {
        const { client } = fakeDb([], { update: { code: 'PGRST205', message: 'missing' } })
        expect(await runAcademyOutboxHousekeeping(client)).toEqual({ status: 'migration_pending' })
        expect(Sentry.captureMessage).not.toHaveBeenCalled()
    })

    it('awaria zapisu jest zgłaszana', async () => {
        const { client } = fakeDb([], { update: { code: '08006', message: 'brak' } })
        expect(await runAcademyOutboxHousekeeping(client)).toEqual({ status: 'failed' })
    })
})

describe('academySenderOverride', () => {
    const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv
    it('stays unused until its own switch is on', () => {
        expect(academySenderOverride(env({ ACADEMY_MAIL_FROM: 'akademia@b2bnetwork.pl' }))).toBeUndefined()
        expect(academySenderOverride(env({ ACADEMY_MAIL_FROM: 'akademia@b2bnetwork.pl', ACADEMY_MAIL_ENABLED: 'true' }))).toBeUndefined()
        expect(academySenderOverride(env({ ACADEMY_MAIL_FROM: 'akademia@b2bnetwork.pl', ACADEMY_MAIL_SENDER_ENABLED: 'false' }))).toBeUndefined()
    })
    it('returns the configured mailbox once enabled', () => {
        expect(academySenderOverride(env({ ACADEMY_MAIL_FROM: 'Akademia <akademia@b2bnetwork.pl>', ACADEMY_MAIL_SENDER_ENABLED: 'true' }))).toBe('Akademia <akademia@b2bnetwork.pl>')
    })
    it('falls back to the default sender for an empty or malformed value', () => {
        expect(academySenderOverride(env({ ACADEMY_MAIL_SENDER_ENABLED: 'true' }))).toBeUndefined()
        expect(academySenderOverride(env({ ACADEMY_MAIL_FROM: 'nie adres', ACADEMY_MAIL_SENDER_ENABLED: 'true' }))).toBeUndefined()
    })
})
