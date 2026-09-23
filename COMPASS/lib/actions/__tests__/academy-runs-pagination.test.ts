import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, COURSE } from './academy-fixtures'
import type { MockSupabase } from '@/test/mocks/supabase'
import { listAcademyRunPage, listMyAcademyRuns } from '../academy-sessions'

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
    it('reads every reservation page for the learner overview without a silent 200-row cutoff', async () => {
        client = academyFixture({ rpcs: {
            academy_list_runs_page: ({ p_offset }) => Array.from({ length: Number(p_offset) < 200 ? 101 : 5 }, (_, index) => ({ id: `${p_offset}-${index}` })),
        } })
        const result = await listMyAcademyRuns()
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toHaveLength(205)
        expect(client.rpc).toHaveBeenCalledTimes(4) // rollout plus three bounded pages
        expect(client.rpc).toHaveBeenCalledWith('academy_list_runs_page', expect.objectContaining({ p_offset: 200, p_limit: 101, p_scope: 'registered' }))
    })
    it('rejects oversized pages before sending a read to PostgreSQL', async () => {
        expect((await listAcademyRunPage({ scope: 'calendar', pageSize: 101 })).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_list_runs_page', expect.anything())
    })
})
