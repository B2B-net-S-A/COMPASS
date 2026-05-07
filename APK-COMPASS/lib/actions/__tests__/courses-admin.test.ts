import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}))

function setupClient(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

afterEach(() => {
    vi.clearAllMocks()
})

// ============================================================
// getReviewQueue
// ============================================================
describe('getReviewQueue', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { getReviewQueue } = await import('../courses-admin')
        const result = await getReviewQueue()
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects regular consultant', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }] },
        })
        const { getReviewQueue } = await import('../courses-admin')
        const result = await getReviewQueue()
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/Niewystarczające uprawnienia/)
    })

    it.each(['admin'])('returns pending_review courses for %s', async (role) => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [
                    { id: 'u-admin', role },
                    { id: 'a1', full_name: 'Anna A.', avatar_url: null },
                ],
                courses: [
                    { id: 'c1', author_id: 'a1', title: 'Pending 1', status: 'pending_review', tags: [], category: 'frontend', level: 'beginner', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0 },
                    { id: 'c2', author_id: 'a1', title: 'Draft', status: 'draft', tags: [], category: 'frontend', level: 'beginner', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0 },
                    { id: 'c3', author_id: 'a1', title: 'Pending 2', status: 'pending_review', tags: [], category: 'cloud', level: 'beginner', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0 },
                ],
            },
        })
        const { getReviewQueue } = await import('../courses-admin')
        const result = await getReviewQueue()
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toHaveLength(2)
            expect(result.data.every((c) => c.status === 'pending_review')).toBe(true)
        }
    })
})

// ============================================================
// approveCourse
// ============================================================
describe('approveCourse', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { approveCourse } = await import('../courses-admin')
        const result = await approveCourse('c1')
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects when course is not in pending_review status', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                courses: [{ id: 'c1', author_id: 'a1', slug: 'k', status: 'draft' }],
            },
        })
        const { approveCourse } = await import('../courses-admin')
        const result = await approveCourse('c1')
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/Nie można zatwierdzić/)
    })

    it('approves and sets status=published, published_at, reviewed_by', async () => {
        const rpcSpy = vi.fn(async () => 'awarded')
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                courses: [{ id: 'c1', author_id: 'a1', slug: 'k', status: 'pending_review' }],
            },
            rpcs: { award_first_publish_bonus: rpcSpy },
        })
        const { approveCourse } = await import('../courses-admin')
        const result = await approveCourse('c1')
        expect(result.success).toBe(true)
        const course = currentClient._tables.courses[0]
        expect(course.status).toBe('published')
        expect(course.reviewed_by).toBe('u-admin')
        expect(course.published_at).toBeTruthy()
        expect(rpcSpy).toHaveBeenCalledWith({ p_course_id: 'c1' })
        if (result.success) expect(result.data.firstPublishBonus).toBe(true)
    })

    it('reports firstPublishBonus=false when RPC returns not_first', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                courses: [{ id: 'c1', author_id: 'a1', slug: 'k', status: 'pending_review' }],
            },
            rpcs: { award_first_publish_bonus: async () => 'not_first' },
        })
        const { approveCourse } = await import('../courses-admin')
        const result = await approveCourse('c1')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.firstPublishBonus).toBe(false)
    })
})

// ============================================================
// rejectCourse
// ============================================================
describe('rejectCourse', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { rejectCourse } = await import('../courses-admin')
        const result = await rejectCourse('c1', 'Bad quality')
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects when reason is too short', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                courses: [{ id: 'c1', author_id: 'a1', slug: 'k', status: 'pending_review', title: 'X' }],
            },
        })
        const { rejectCourse } = await import('../courses-admin')
        const result = await rejectCourse('c1', 'bad')
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/co najmniej 5 znaków/)
    })

    it('rejects when course not in pending_review', async () => {
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                courses: [{ id: 'c1', author_id: 'a1', slug: 'k', status: 'published', title: 'X' }],
            },
        })
        const { rejectCourse } = await import('../courses-admin')
        const result = await rejectCourse('c1', 'Niezgodne z polityką')
        expect(result.success).toBe(false)
    })

    it('updates status=rejected and stores reason', async () => {
        const rpcSpy = vi.fn(async () => 'notification-id')
        setupClient({
            user: { id: 'u-admin', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role: 'admin' }],
                courses: [{ id: 'c1', author_id: 'a1', slug: 'k', status: 'pending_review', title: 'Title' }],
            },
            rpcs: { create_notification: rpcSpy },
        })
        const { rejectCourse } = await import('../courses-admin')
        const result = await rejectCourse('c1', 'Pytanie 3 jest niejednoznaczne — popraw treść')
        expect(result.success).toBe(true)
        const course = currentClient._tables.courses[0]
        expect(course.status).toBe('rejected')
        expect(course.rejection_reason).toMatch(/Pytanie 3/)
        expect(rpcSpy).toHaveBeenCalled()
    })
})

// ============================================================
// archiveCourse
// ============================================================
describe('archiveCourse', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { archiveCourse } = await import('../courses-admin')
        const result = await archiveCourse('c1')
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('allows author to archive own course', async () => {
        setupClient({
            user: { id: 'u-author', email: 'a@x.com' },
            tables: {
                profiles: [{ id: 'u-author', role: 'consultant' }],
                courses: [{ id: 'c1', author_id: 'u-author', slug: 'k', status: 'published' }],
            },
        })
        const { archiveCourse } = await import('../courses-admin')
        const result = await archiveCourse('c1')
        expect(result.success).toBe(true)
        expect(currentClient._tables.courses[0].status).toBe('archived')
    })

    it('rejects non-author non-admin', async () => {
        setupClient({
            user: { id: 'u-other', email: 'o@x.com' },
            tables: {
                profiles: [{ id: 'u-other', role: 'consultant' }],
                courses: [{ id: 'c1', author_id: 'u-author', slug: 'k', status: 'published' }],
            },
        })
        const { archiveCourse } = await import('../courses-admin')
        const result = await archiveCourse('c1')
        expect(result.success).toBe(false)
    })
})
