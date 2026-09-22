import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient, type MockSupabase, type TableData } from '@/test/mocks/supabase'
import { sendCourseInactivityReminder } from '@/lib/email'
import { GET } from '../route'

let client: MockSupabase
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => client }))
vi.mock('@/lib/email', () => ({ sendCourseInactivityReminder: vi.fn() }))
vi.mock('@/lib/audit/cron-heartbeat', () => ({ withCronHeartbeat: (_event: string, handler: unknown) => handler }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() }, logCompat: { error: vi.fn() } }))
const enrollment = { id: 'enrollment', user_id: 'user', course_id: 'course', version_id: 'old', run_id: null, completed_at: null, completed_lessons: ['l1'], last_accessed_at: '2026-09-15T10:00:00Z', last_inactivity_email_at: null }
function setup(tables: TableData = {}) {
    client = createMockSupabaseClient({ tables: { course_enrollments: [enrollment], courses: [{ id: 'course', slug: 'tytul', title: 'Nowy tytuł', status: 'published' }], course_versions: [{ id: 'old', status: 'published', metadata: { title: 'Poprzednia wersja' } }], course_lessons: [{ id: 'l1', version_id: 'old' }, { id: 'l2', version_id: 'old' }, { id: 'l3', version_id: 'new' }], profiles: [{ id: 'user', full_name: 'Uczestnik', email: 'user@example.test', role: 'consultant', is_external: false, employment_status: 'active' }], course_runs: [], course_run_registrations: [], ...tables } })
    // Generic fixture does not parse the existing PostgREST is-null/lt OR.
    // Candidate rows here are already eligible for that unchanged weekly throttle.
    const from = client.from
    client.from = vi.fn(table => { const query = from(table); query.or = () => query; return query })
}
const request = () => new NextRequest('https://compass.test/api/cron/course-inactivity', { headers: { authorization: 'Bearer test-cron-secret' } })
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-22T12:00:00Z')); setup(); vi.mocked(sendCourseInactivityReminder).mockResolvedValue({ success: true }) })
afterEach(() => vi.useRealTimers())

it('sends the pinned version title, denominator and enrollment reference', async () => {
    expect((await GET(request())).status).toBe(200)
    expect(sendCourseInactivityReminder).toHaveBeenCalledWith('user@example.test', 'Uczestnik', expect.objectContaining({ courseTitle: 'Poprzednia wersja', enrollmentId: 'enrollment', totalLessons: 2, completedLessons: 1, progressPercent: 50 }))
    expect(client._tables.course_enrollments[0].last_inactivity_email_at).toBe('2026-09-22T12:00:00.000Z')
})
it.each(['cancelled', 'waitlisted'])('does not remind a %s registration', async status => {
    setup({ course_enrollments: [{ ...enrollment, run_id: 'run' }], course_runs: [{ id: 'run', status: 'published' }], course_run_registrations: [{ enrollment_id: 'enrollment', user_id: 'user', run_id: 'run', status }] })
    await GET(request())
    expect(sendCourseInactivityReminder).not.toHaveBeenCalled()
})
it('does not remind a cancelled edition or inactive account', async () => {
    setup({ course_enrollments: [{ ...enrollment, run_id: 'run' }], course_runs: [{ id: 'run', status: 'cancelled' }], course_run_registrations: [{ enrollment_id: 'enrollment', user_id: 'user', run_id: 'run', status: 'confirmed' }] })
    await GET(request()); expect(sendCourseInactivityReminder).not.toHaveBeenCalled()
    setup({ profiles: [{ id: 'user', email: 'user@example.test', role: 'consultant', employment_status: 'exited' }] })
    await GET(request()); expect(sendCourseInactivityReminder).not.toHaveBeenCalled()
})
it('keeps a confirmed active run eligible and ignores duplicate/foreign completed lesson ids', async () => {
    setup({ course_enrollments: [{ ...enrollment, run_id: 'run', completed_lessons: ['l1', 'l1', 'l3'] }], course_runs: [{ id: 'run', status: 'published' }], course_run_registrations: [{ enrollment_id: 'enrollment', user_id: 'user', run_id: 'run', status: 'confirmed' }] })
    await GET(request())
    expect(sendCourseInactivityReminder).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ enrollmentId: 'enrollment', completedLessons: 1, totalLessons: 2 }))
})
it('does not record a successful reminder after a delivery failure', async () => {
    vi.mocked(sendCourseInactivityReminder).mockResolvedValue({ success: false })
    expect((await GET(request())).status).toBe(500)
    expect(client._tables.course_enrollments[0].last_inactivity_email_at).toBeNull()
})
it('rejects missing cron authorization before accessing data', async () => {
    expect((await GET(new NextRequest('https://compass.test/api/cron/course-inactivity'))).status).toBe(401)
    expect(client.from).not.toHaveBeenCalled()
})
