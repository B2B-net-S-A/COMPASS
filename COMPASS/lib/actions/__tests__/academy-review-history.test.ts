import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, COURSE, USER, id } from './academy-fixtures'
import type { MockSupabaseConfig } from '@/test/mocks/supabase'
const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
import { getAcademyReviewHistory } from '../academy-review-history'

const cursor = { createdAt: '2026-09-22T12:00:00.123456+00:00', id: id(81) }
const item = { id: id(82), action: 'COURSE_REJECTED', createdAt: '2026-09-22T12:00:00Z', actorName: 'Moderator', versionNumber: 1, submissionId: null, reason: 'Historyczny powód', approved: null }
let client: ReturnType<typeof academyFixture>
function setup(config: MockSupabaseConfig = {}) { client = academyFixture(config); mocks.create.mockReturnValue(client) }
beforeEach(() => { vi.clearAllMocks(); setup({ rpcs: { academy_course_review_history: () => ({ items: [item], nextCursor: null }) } }) })

describe('Scoped review history action', () => {
    it('uses only the narrow RPC and preserves cursor microseconds', async () => {
        expect(await getAcademyReviewHistory({ courseId: COURSE, cursor, limit: 10 })).toEqual({ success: true, data: { items: [item], nextCursor: null } })
        expect(client.rpc).toHaveBeenCalledWith('academy_course_review_history', { p_course_id: COURSE, p_before_created_at: cursor.createdAt, p_before_id: cursor.id, p_limit: 10 })
        expect(client.from).not.toHaveBeenCalledWith('academy_audit_events')
    })
    it.each([{ courseId: 'bad' }, { courseId: COURSE, limit: 51 }, { courseId: COURSE, cursor: { ...cursor, id: 'bad' } }, { courseId: COURSE, cursor: { ...cursor, createdAt: 'infinity' } }])('rejects invalid arguments %j', async input => {
        expect((await getAcademyReviewHistory(input)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_course_review_history', expect.anything())
    })
    it('rejects a revoked trainer grant before attempting the scoped read', async () => {
        setup({ tables: { academy_user_capabilities: [{ user_id: USER, can_train: false, revoked_at: '2026-09-22T00:00:00Z' }] } })
        expect((await getAcademyReviewHistory({ courseId: COURSE })).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_course_review_history', expect.anything())
    })
    it('does not turn a database scope denial into an empty successful history', async () => {
        const refusal = { data: null, error: { code: '42501', message: 'Brak uprawnień do historii decyzji tego szkolenia.' } }
        client.rpc.mockResolvedValueOnce({ data: { allowed: true }, error: null }).mockResolvedValueOnce(refusal)
        expect(await getAcademyReviewHistory({ courseId: COURSE })).toEqual({ success: false, error: refusal.error.message })
    })
    it('drops extra payload fields instead of exposing a raw audit row', async () => {
        setup({ rpcs: { academy_course_review_history: () => ({ items: [{ ...item, actor_id: USER, details: { secret: 'private' } }], nextCursor: null }) } })
        expect(await getAcademyReviewHistory({ courseId: COURSE })).toEqual({ success: true, data: { items: [item], nextCursor: null } })
    })
    it('fails safely if the projection contains an unsupported audit action', async () => {
        setup({ rpcs: { academy_course_review_history: () => ({ items: [{ ...item, action: 'ACADEMY_IDENTITY_VERIFIED' }], nextCursor: null }) } })
        expect(await getAcademyReviewHistory({ courseId: COURSE })).toEqual({ success: false, error: 'Nie udało się odczytać historii decyzji. Odśwież widok.' })
    })
})
