import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createMockSupabaseClient, type MockSupabase, type TableData } from '@/test/mocks/supabase'
import { sendEmail } from '@/lib/email/sender'
import { GET } from '../route'

let client: MockSupabase
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => client }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/audit/cron-heartbeat', () => ({ withCronHeartbeat: (_event: string, handler: unknown) => handler }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() }, logCompat: { error: vi.fn() } }))
const RUN = '00000000-0000-4000-8000-0000000000aa'
const enrollment = { id: 'enrollment', user_id: 'user', course_id: 'course', version_id: 'old', run_id: null, completed_at: null, completed_lessons: ['l1'], last_accessed_at: '2026-09-15T10:00:00Z', last_inactivity_email_at: null }
function setup(tables: TableData = {}, outboxError?: { code: string; message: string }) {
    client = createMockSupabaseClient({ tables: { course_enrollments: [enrollment], courses: [{ id: 'course', slug: 'tytul', title: 'Nowy tytuł', status: 'published' }], course_versions: [{ id: 'old', status: 'published', metadata: { title: 'Poprzednia wersja' } }], course_lessons: [{ id: 'l1', version_id: 'old' }, { id: 'l2', version_id: 'old' }, { id: 'l3', version_id: 'new' }], profiles: [{ id: 'user', full_name: 'Uczestnik', email: 'user@example.test', role: 'consultant', is_external: false, employment_status: 'active' }], course_runs: [], course_run_registrations: [], academy_outbox: [], ...tables } })
    // Generic fixture does not parse the existing PostgREST is-null/lt OR.
    // Candidate rows here are already eligible for that unchanged weekly throttle.
    const from = client.from
    client.from = vi.fn(table => {
        if (table === 'academy_outbox' && outboxError) return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: outboxError }) }) }) }
        const query = from(table); query.or = () => query; return query
    })
}
const request = () => new NextRequest('https://compass.test/api/cron/course-inactivity', { headers: { authorization: 'Bearer test-cron-secret' } })
const outbox = () => client._tables.academy_outbox
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-22T12:00:00Z')); setup() })
afterEach(() => vi.useRealTimers())

it('holds the pinned version reminder and sends nothing', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, sent: 0, held: 1, failed: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(outbox()).toHaveLength(1)
    expect(outbox()[0]).toMatchObject({ kind: 'course_inactivity', recipient: 'user@example.test', expires_at: '2026-09-29T12:00:00.000Z' })
    expect(String(outbox()[0].subject)).toContain('Poprzednia wersja')
    expect(String(outbox()[0].html)).toContain('1/2 lekcji')
})
it('does not claim a delivery that never happened', async () => {
    await GET(request())
    expect(client._tables.course_enrollments[0].last_inactivity_email_at).toBeNull()
})
it('keeps sending nothing with the mail switch on', async () => {
    vi.stubEnv('ACADEMY_MAIL_ENABLED', 'true')
    await GET(request())
    expect(sendEmail).not.toHaveBeenCalled()
    expect(outbox()).toHaveLength(1)
    vi.unstubAllEnvs()
})
it('uses a key that repeats within the week and changes the next week', async () => {
    await GET(request())
    const firstKey = outbox()[0].dedupe_key
    expect(firstKey).toMatch(/^course_inactivity:enrollment:\d+$/)
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'))
    setup()
    await GET(request())
    expect(outbox()[0].dedupe_key).toBe(firstKey)
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
    setup()
    await GET(request())
    expect(outbox()[0].dedupe_key).not.toBe(firstKey)
})
it.each(['cancelled', 'waitlisted'])('does not hold a reminder for a %s registration', async status => {
    setup({ course_enrollments: [{ ...enrollment, run_id: RUN }], course_runs: [{ id: RUN, status: 'published' }], course_run_registrations: [{ enrollment_id: 'enrollment', user_id: 'user', run_id: RUN, status }] })
    await GET(request())
    expect(outbox()).toHaveLength(0)
})
it('does not hold a reminder for a cancelled edition or inactive account', async () => {
    setup({ course_enrollments: [{ ...enrollment, run_id: RUN }], course_runs: [{ id: RUN, status: 'cancelled' }], course_run_registrations: [{ enrollment_id: 'enrollment', user_id: 'user', run_id: RUN, status: 'confirmed' }] })
    await GET(request()); expect(outbox()).toHaveLength(0)
    setup({ profiles: [{ id: 'user', email: 'user@example.test', role: 'consultant', employment_status: 'exited' }] })
    await GET(request()); expect(outbox()).toHaveLength(0)
})
it('keeps a confirmed active run eligible and ignores duplicate/foreign completed lesson ids', async () => {
    setup({ course_enrollments: [{ ...enrollment, run_id: RUN, completed_lessons: ['l1', 'l1', 'l3'] }], course_runs: [{ id: RUN, status: 'published' }], course_run_registrations: [{ enrollment_id: 'enrollment', user_id: 'user', run_id: RUN, status: 'confirmed' }] })
    await GET(request())
    expect(outbox()[0]).toMatchObject({ run_id: RUN })
    expect(String(outbox()[0].html)).toContain('1/2 lekcji')
})
it.each([
    ['PGRST205', 'brak tabeli'],
    ['42P01', 'brak tabeli'],
    ['08006', 'awaria zapisu'],
])('%s (%s) sends nothing, reports failure and stops the loop', async code => {
    setup({ course_enrollments: [enrollment, { ...enrollment, id: 'drugi' }] }, { code, message: 'x' })
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false, sent: 0, held: 0, failed: 1 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).toHaveBeenCalledOnce()
    expect(client._tables.course_enrollments[0].last_inactivity_email_at).toBeNull()
})
it('rejects missing cron authorization before accessing data', async () => {
    expect((await GET(new NextRequest('https://compass.test/api/cron/course-inactivity'))).status).toBe(401)
    expect(client.from).not.toHaveBeenCalled()
})
