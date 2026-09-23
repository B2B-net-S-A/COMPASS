import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, COURSE } from './academy-fixtures'
import type { MockSupabase } from '@/test/mocks/supabase'
import { listAcademyRunPage, getMyAcademyRunOverview } from '../academy-sessions'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => { client = academyFixture() })

describe('bounded Academy run reads', () => {
    it('asks the database for one extra row so the trainer can navigate past page 200', async () => {
        client = academyFixture({ rpcs: { academy_list_runs_page: () => Array.from({ length: 25 }, (_, index) => ({ id: String(index) })) } })
        const result = await listAcademyRunPage({ courseId: COURSE, page: 9, pageSize: 24, scope: 'managed' })
        expect(result).toMatchObject({ success: true, data: { page: 9, hasMore: true } })
        if (result.success) expect(result.data.items).toHaveLength(24)
        expect(client.rpc).toHaveBeenCalledWith('academy_list_runs_page', {
            p_course_id: COURSE, p_offset: 192, p_limit: 25, p_scope: 'managed',
            p_window_start: null, p_window_end: null, p_course_ids: null,
        })
    })
    it('requests only the selected waitlist page and one upcoming session', async () => {
        client = academyFixture({ rpcs: {
            academy_my_run_overview: () => ({ waiting: {
                items: Array.from({ length: 5 }, (_, index) => ({ runId: COURSE, courseTitle: 'Szkolenie', runTitle: `Grupa ${index}` })),
                total: 1005, page: 41, pageSize: 25,
            }, upcoming: { runId: COURSE, sessionTitle: 'Spotkanie', startsAt: '2030-09-15T10:00:00Z', timeZone: 'Europe/Warsaw' } }),
        } })
        const result = await getMyAcademyRunOverview(41)
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.waiting.items).toHaveLength(5)
        expect(client.rpc).toHaveBeenCalledTimes(2) // rollout plus one compact overview
        expect(client.rpc).toHaveBeenCalledWith('academy_my_run_overview', { p_waitlist_page: 41, p_limit: 25 })
        expect(client.rpc).not.toHaveBeenCalledWith('academy_list_runs_page', expect.anything())
    })
    it('rejects a short response rather than hiding reservations', async () => {
        client = academyFixture({ rpcs: {
            academy_my_run_overview: () => ({ waiting: { items: [], total: 26, page: 1, pageSize: 25 }, upcoming: null }),
        } })
        expect((await getMyAcademyRunOverview()).success).toBe(false)
    })
    it('rejects oversized pages before sending a read to PostgreSQL', async () => {
        expect((await listAcademyRunPage({ scope: 'calendar', pageSize: 101 })).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_list_runs_page', expect.anything())
    })
})
