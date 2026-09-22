import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'
import { academyFixture, courseRow, versionRow, id, COURSE, DRAFT, OTHER, USER, VERSION } from './academy-fixtures'
import { approveCourse, archiveCourse, getReviewQueue, rejectCourse } from '../courses-admin'

const SUBMISSION = id(100)
let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
function setup(config: MockSupabaseConfig = {}) {
    client = academyFixture({ ...config, tables: { profiles: [{ id: USER, role: 'admin', full_name: 'Administrator' }], ...config.tables } })
    return client
}
beforeEach(() => setup())

describe('review authorization', () => {
    it.each([
        ['queue', () => getReviewQueue()],
        ['approve', () => approveCourse(COURSE, DRAFT, SUBMISSION)],
        ['reject', () => rejectCourse(COURSE, 'Potrzebne poprawki', DRAFT, SUBMISSION)],
        ['archive', () => archiveCourse(COURSE)],
    ] as const)('requires a signed-in administrator for %s', async (_name, action) => {
        setup({ user: null })
        expect((await action()).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalled()
        setup({ tables: { profiles: [{ id: USER, role: 'consultant' }] } })
        expect((await action()).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('does not allow even the author to archive without administrator rights', async () => {
        setup({ tables: { profiles: [{ id: USER, role: 'consultant' }], courses: [courseRow({ author_id: USER })] } })
        expect(await archiveCourse(COURSE)).toEqual({ success: false, error: 'Ta operacja wymaga uprawnień administratora.' })
    })
})

describe('review queue', () => {
    it('returns pending versions rather than relying on course-level publication status', async () => {
        setup({ tables: { courses: [courseRow({ author_id: OTHER })], profiles: [{ id: USER, role: 'admin' }, { id: OTHER, full_name: 'Autorka', avatar_url: 'avatar' }], course_versions: [versionRow(), versionRow({ id: DRAFT, status: 'pending_review', version_number: 3, metadata: { title: 'Nowy szkic do akceptacji' }, submitted_at: '2026-09-22T10:00:00Z' }), versionRow({ id: id(23), status: 'draft' })] } })
        const result = await getReviewQueue()
        expect(result.success && result.data).toEqual([expect.objectContaining({ id: COURSE, title: 'Nowy szkic do akceptacji', version_id: DRAFT, version_number: 3, status: 'pending_review', author_name: 'Autorka' })])
    })
    it('returns an empty queue when no versions are pending', async () => {
        expect(await getReviewQueue()).toEqual({ success: true, data: [] })
    })
    it('does not expose a version whose course is not visible', async () => {
        setup({ tables: { courses: [], course_versions: [versionRow({ status: 'pending_review' })] } })
        expect(await getReviewQueue()).toEqual({ success: true, data: [] })
    })
})

describe('immutable version approval', () => {
    it('requires the submission token from the rendered form, even when the version still exists', async () => {
        expect((await approveCourse(COURSE, DRAFT)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_review_course', expect.anything())
    })
    it('forwards the form token unchanged instead of replacing it with the current database token', async () => {
        setup({ tables: { course_versions: [versionRow({ id: DRAFT, submission_id: id(101) })] }, rpcs: { academy_review_course: () => { throw new Error('review_submission_changed') } } })
        expect((await approveCourse(COURSE, DRAFT, SUBMISSION)).success).toBe(false)
        expect(client.rpc).toHaveBeenCalledWith('academy_review_course', { p_version_id: DRAFT, p_approve: true, p_reason: null, p_submission_id: SUBMISSION })
    })
    it('requires an explicit version from the reviewed screen', async () => {
        expect(await approveCourse(COURSE)).toEqual({ success: false, error: 'Odśwież podgląd wersji przed podjęciem decyzji.' })
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('checks that the reviewed version belongs to the supplied course', async () => {
        setup({ tables: { course_versions: [versionRow({ id: DRAFT, course_id: id(999) })] } })
        expect((await approveCourse(COURSE, DRAFT, SUBMISSION)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it.each(['invalid', ''])('rejects a malformed version identifier %s', async versionId => {
        expect((await approveCourse(COURSE, versionId, SUBMISSION)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it.each([true, false])('reports first publication bonus returned by the atomic RPC: %s', async firstBonus => {
        setup({ rpcs: { academy_review_course: () => ({ first_publish_bonus: firstBonus }) } })
        expect(await approveCourse(COURSE, DRAFT, SUBMISSION)).toEqual({ success: true, data: { firstPublishBonus: firstBonus } })
        expect(client.rpc).toHaveBeenCalledWith('academy_review_course', { p_version_id: DRAFT, p_approve: true, p_reason: null, p_submission_id: SUBMISSION })
        expect(client._tables.courses[0].published_version_id).toBe(VERSION)
        expect(revalidatePath).toHaveBeenCalledWith('/learning', 'layout')
    })
    it('propagates a stale/non-pending version rejection without reporting publication', async () => {
        setup({ rpcs: { academy_review_course: () => { throw new Error('pending_review_required') } } })
        expect(await approveCourse(COURSE, DRAFT, SUBMISSION)).toEqual({ success: false, error: 'Ta wersja nie oczekuje już na akceptację. Odśwież kolejkę.' })
        expect(revalidatePath).not.toHaveBeenCalled()
    })
})

describe('version rejection and archive', () => {
    it.each(['bad', ' '.repeat(5), 'x'.repeat(3001)])('validates rejection reasons before RPC', async reason => {
        expect((await rejectCourse(COURSE, reason, DRAFT, SUBMISSION)).success).toBe(false)
        expect(client.rpc.mock.calls.filter(([name]) => name !== 'academy_rollout_access')).toEqual([])
    })
    it('sends trimmed reasons with the exact rejected version', async () => {
        setup({ rpcs: { academy_review_course: () => null } })
        expect(await rejectCourse(COURSE, '  Popraw drugi rozdział.  ', DRAFT, SUBMISSION)).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith('academy_review_course', { p_version_id: DRAFT, p_approve: false, p_reason: 'Popraw drugi rozdział.', p_submission_id: SUBMISSION })
    })
    it('propagates invalid rejection transitions from the database', async () => {
        setup({ rpcs: { academy_review_course: () => { throw new Error('immutable_course_version') } } })
        expect(await rejectCourse(COURSE, 'Popraw rozdział', VERSION, SUBMISSION)).toEqual({ success: false, error: 'Opublikowanej wersji nie można zmieniać. Utwórz nowy szkic.' })
    })
    it('archives via the administrator RPC without deleting history in the action', async () => {
        setup({ rpcs: { academy_archive_course: () => null } })
        expect(await archiveCourse(COURSE)).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith('academy_archive_course', { p_course_id: COURSE })
        expect(client._tables.course_versions).toHaveLength(3)
    })
    it('propagates archive failures', async () => {
        setup({ rpcs: { academy_archive_course: () => { throw new Error('Archiwizacja niedostępna.') } } })
        expect(await archiveCourse(COURSE)).toEqual({ success: false, error: 'Nie udało się wykonać operacji. Odśwież stronę i spróbuj ponownie.' })
    })
})
