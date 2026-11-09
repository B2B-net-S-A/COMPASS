import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reminderBatchId, reminderDedupeKey, runReminderMail, upcomingStages } from '../run-reminders'
import { holdAcademyRunReminders } from '../run-reminders-worker'

const mocks = vi.hoisted(() => ({ hold: vi.fn() }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../outbound', async importOriginal => ({ ...(await importOriginal<typeof import('../outbound')>()), holdAcademyMail: mocks.hold }))

const now = new Date('2027-01-01T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()

describe('upcomingStages', () => {
    it('plans all four stages far enough ahead', () => {
        expect(upcomingStages(days(22), now)).toEqual(['t21', 't7', 't1', 't1h'])
    })
    it('never creates a stage whose moment has passed', () => {
        expect(upcomingStages(days(10), now)).toEqual(['t7', 't1', 't1h'])
        expect(upcomingStages(days(2), now)).toEqual(['t1', 't1h'])
        expect(upcomingStages(new Date(now.getTime() + 2 * 3_600_000).toISOString(), now)).toEqual(['t1h'])
    })
    it('treats the exact stage moment as passed', () => {
        expect(upcomingStages(days(21), now)).toEqual(['t7', 't1', 't1h'])
    })
    it('returns nothing for a past or malformed start', () => {
        expect(upcomingStages(days(-1), now)).toEqual([])
        expect(upcomingStages('zle', now)).toEqual([])
    })
})

describe('reminder identity', () => {
    it('keeps one key per person, session and stage', () => {
        expect(reminderDedupeKey('s', 't7', 'a@x.test')).toBe('run_reminder:s:t7:a@x.test')
    })
    it('gives a stable UUID batch per session and stage', () => {
        const id = reminderBatchId('s1', 't7')
        expect(id).toBe(reminderBatchId('s1', 't7'))
        expect(id).not.toBe(reminderBatchId('s1', 't1'))
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    })
})

describe('runReminderMail', () => {
    const input = { stage: 't1' as const, courseTitle: 'PEGA <x>', sessionTitle: 'Warsztat', startsLabel: '16 lutego', appUrl: 'https://app.test', runId: 'r', sessionId: 's', hasCalendarFile: true }
    it('has a personal link placeholder, calendar and resignation link, and no token', () => {
        const { html, subject } = runReminderMail(input)
        expect(html).toContain('{{academy_personal_link}}')
        expect(html).toContain('https://app.test/api/academy/sessions/s/calendar')
        expect(html).toContain('https://app.test/learning/edycje/r')
        expect(html).toContain('PEGA &lt;x&gt;')
        expect(`${subject}${html}`).not.toMatch(/[?&](token|otp)=/)
    })
    it('omits the calendar file for a managed meeting', () => {
        expect(runReminderMail({ ...input, hasCalendarFile: false }).html).not.toContain('calendar')
    })
})

describe('holdAcademyRunReminders', () => {
    const session = { id: 's1', run_id: 'r1', title: 'Warsztat', starts_at: days(2), time_zone: 'Europe/Warsaw', meeting_mode: 'external_link', course_runs: { title: 'Grupa', status: 'published', course_id: 'c', courses: { title: 'PEGA' } } }
    function client(options: { sessions?: unknown[]; sessionError?: { code: string; message: string }; registered?: unknown[]; existing?: string[]; outboxError?: { code: string; message: string } } = {}) {
        return { from: (table: string) => {
            const chain: Record<string, unknown> = {}
            for (const method of ['select', 'eq', 'gt', 'lte', 'order']) chain[method] = () => chain
            chain.limit = async () => table === 'course_sessions' ? { data: options.sessions ?? [session], error: options.sessionError ?? null } : { data: options.registered ?? [{ profiles: { email: 'A@X.test' } }, { profiles: { email: null } }], error: null }
            chain.in = async () => ({ data: (options.existing ?? []).map(dedupe_key => ({ dedupe_key })), error: options.outboxError ?? null })
            return chain
        } } as unknown as SupabaseClient
    }
    beforeEach(() => { vi.clearAllMocks(); process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'; mocks.hold.mockResolvedValue({ status: 'held', id: 'x' }) })

    it('holds one row per future stage and skips a person without an address', async () => {
        expect(await holdAcademyRunReminders(client(), now)).toEqual({ status: 'done', held: 2, duplicate: 0, refused: 0 })
        expect(mocks.hold.mock.calls.map(call => call[1].dedupeKey)).toEqual(['run_reminder:s1:t1:a@x.test', 'run_reminder:s1:t1h:a@x.test'])
        expect(mocks.hold.mock.calls[0][1]).toMatchObject({ kind: 'academy.run_reminder', recipient: 'a@x.test', expiresAt: new Date(session.starts_at).toISOString() })
    })
    it('does not touch the database row again on the next run', async () => {
        expect(await holdAcademyRunReminders(client({ existing: ['run_reminder:s1:t1:a@x.test', 'run_reminder:s1:t1h:a@x.test'] }), now)).toEqual({ status: 'done', held: 0, duplicate: 0, refused: 0 })
        expect(mocks.hold).not.toHaveBeenCalled()
    })
    it('reports a missing outbox as pending, not as a failure', async () => {
        expect(await holdAcademyRunReminders(client({ outboxError: { code: 'PGRST205', message: 'x' } }), now)).toEqual({ status: 'migration_pending' })
        mocks.hold.mockResolvedValue({ status: 'refused', reason: 'migration_pending' })
        expect(await holdAcademyRunReminders(client(), now)).toEqual({ status: 'migration_pending' })
    })
    it('stops on a broken queue so the worker reports it', async () => {
        mocks.hold.mockResolvedValue({ status: 'refused', reason: 'write_failed' })
        expect(await holdAcademyRunReminders(client(), now)).toEqual({ status: 'failed' })
        expect(mocks.hold).toHaveBeenCalledTimes(1)
    })
    it('does nothing without a configured application address', async () => {
        delete process.env.NEXT_PUBLIC_APP_URL
        expect(await holdAcademyRunReminders(client(), now)).toEqual({ status: 'done', held: 0, duplicate: 0, refused: 0 })
        expect(mocks.hold).not.toHaveBeenCalled()
    })
    it('skips sessions without registered people', async () => {
        expect(await holdAcademyRunReminders(client({ registered: [] }), now)).toEqual({ status: 'done', held: 0, duplicate: 0, refused: 0 })
    })
})
