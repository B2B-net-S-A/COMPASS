import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'
import { academyFixture, courseRow, COURSE, OTHER } from './academy-fixtures'
import { deleteDraftCourse, listPublishedCourses } from '../courses'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
function setup(config: MockSupabaseConfig = {}) { client = academyFixture(config); return client }
beforeEach(() => setup())
const fail = (message: string) => () => { throw new Error(message) }

describe('deleting an unpublished draft', () => {
    it('refuses without a trainer grant and without a valid id', async () => {
        setup({ tables: { academy_user_capabilities: [] } })
        expect((await deleteDraftCourse(COURSE)).success).toBe(false)
        setup()
        expect((await deleteDraftCourse('nie-uuid')).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_delete_draft_course', expect.anything())
    })
    it.each([['draft_has_activity', 'zapisy'], ['draft_has_materials', 'materiały'], ['unpublished_draft_required', 'bez publikacji'], ['rehearsal_course_protected', 'atrapy']])('explains the database refusal %s', async (reason, fragment) => {
        setup({ rpcs: { academy_delete_draft_course: fail(reason) } })
        expect(await deleteDraftCourse(COURSE)).toEqual({ success: false, error: expect.stringContaining(fragment) })
    })
    it('deletes through the database guard only', async () => {
        setup({ rpcs: { academy_delete_draft_course: () => null } })
        expect(await deleteDraftCourse(COURSE)).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith('academy_delete_draft_course', { p_course_id: COURSE })
    })
})

describe('rehearsal course in the catalogue', () => {
    it('never lists a rehearsal course once the column exists', async () => {
        setup({ tables: { courses: [courseRow(), courseRow({ id: OTHER, slug: 'atrapa', title: 'Atrapa', is_rehearsal: true })] } })
        const result = await listPublishedCourses()
        expect(result.success && result.data.items.map(course => course.id)).toEqual([COURSE])
    })
})
