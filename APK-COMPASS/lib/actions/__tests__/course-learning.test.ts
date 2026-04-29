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
// enrollInCourse
// ============================================================
describe('enrollInCourse', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { enrollInCourse } = await import('../course-learning')
        const result = await enrollInCourse('c1')
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects when course is not published', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                courses: [{ id: 'c1', status: 'draft', slug: 'k' }],
                course_enrollments: [],
            },
        })
        const { enrollInCourse } = await import('../course-learning')
        const result = await enrollInCourse('c1')
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/nie jest opublikowany/)
    })

    it('returns existing enrollment as alreadyEnrolled', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                courses: [{ id: 'c1', status: 'published', slug: 'k' }],
                course_enrollments: [{ id: 'e-existing', user_id: 'u1', course_id: 'c1' }],
            },
        })
        const { enrollInCourse } = await import('../course-learning')
        const result = await enrollInCourse('c1')
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.alreadyEnrolled).toBe(true)
            expect(result.data.enrollmentId).toBe('e-existing')
        }
    })

    it('creates new enrollment when not yet enrolled', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                courses: [{ id: 'c1', status: 'published', slug: 'k' }],
                course_enrollments: [],
            },
        })
        const { enrollInCourse } = await import('../course-learning')
        const result = await enrollInCourse('c1')
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.alreadyEnrolled).toBe(false)
        }
        expect(currentClient._tables.course_enrollments).toHaveLength(1)
        expect(currentClient._tables.course_enrollments[0].user_id).toBe('u1')
    })
})

// ============================================================
// markLessonComplete
// ============================================================
describe('markLessonComplete', () => {
    it('rejects when not enrolled', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { course_enrollments: [] },
        })
        const { markLessonComplete } = await import('../course-learning')
        const result = await markLessonComplete('c1', 'l1')
        expect(result.success).toBe(false)
    })

    it('appends lesson to completed_lessons (no duplicates)', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                course_enrollments: [{ id: 'e1', user_id: 'u1', course_id: 'c1', completed_lessons: [] }],
            },
        })
        const { markLessonComplete } = await import('../course-learning')
        const result = await markLessonComplete('c1', 'l1')
        expect(result.success).toBe(true)
        expect(currentClient._tables.course_enrollments[0].completed_lessons).toEqual(['l1'])
    })

    it('does not duplicate when lesson already completed', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                course_enrollments: [{ id: 'e1', user_id: 'u1', course_id: 'c1', completed_lessons: ['l1'] }],
            },
        })
        const { markLessonComplete } = await import('../course-learning')
        const result = await markLessonComplete('c1', 'l1')
        expect(result.success).toBe(true)
        expect(currentClient._tables.course_enrollments[0].completed_lessons).toEqual(['l1'])
    })
})

// ============================================================
// submitQuizAttempt — RPC integration
// ============================================================
describe('submitQuizAttempt', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { submitQuizAttempt } = await import('../course-learning')
        const result = await submitQuizAttempt('c1', [])
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('calls submit_quiz_attempt RPC with correct payload', async () => {
        const rpcSpy = vi.fn(async () => ({ score_percent: 80, passed: true, attempt_id: 'a1', already_awarded: false, award_status: 'awarded' }))
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            rpcs: { submit_quiz_attempt: rpcSpy },
        })
        const answers = [
            { question_id: 'q1', selected_option_id: 'o1' },
            { question_id: 'q2', selected_option_id: 'o2' },
        ]
        const { submitQuizAttempt } = await import('../course-learning')
        const result = await submitQuizAttempt('c1', answers)
        expect(result.success).toBe(true)
        expect(rpcSpy).toHaveBeenCalledWith({ p_course_id: 'c1', p_answers: answers })
        if (result.success) {
            expect(result.data.passed).toBe(true)
            expect(result.data.score_percent).toBe(80)
        }
    })
})

// ============================================================
// submitRating
// ============================================================
describe('submitRating', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { submitRating } = await import('../course-learning')
        const result = await submitRating('c1', 5)
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects rating outside 1..5', async () => {
        setupClient({ user: { id: 'u1', email: 'u@x.com' } })
        const { submitRating } = await import('../course-learning')
        const r1 = await submitRating('c1', 0)
        const r2 = await submitRating('c1', 6)
        expect(r1.success).toBe(false)
        expect(r2.success).toBe(false)
    })

    it('rejects when course not completed by user', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                course_enrollments: [{ id: 'e1', user_id: 'u1', course_id: 'c1', completed_at: null }],
            },
        })
        const { submitRating } = await import('../course-learning')
        const result = await submitRating('c1', 5)
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/dopiero po ukończeniu/)
    })

    it('inserts rating when course is completed', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                course_enrollments: [{ id: 'e1', user_id: 'u1', course_id: 'c1', completed_at: '2026-04-29T12:00:00Z' }],
                courses: [{ id: 'c1', slug: 'k' }],
                course_ratings: [],
            },
        })
        const { submitRating } = await import('../course-learning')
        const result = await submitRating('c1', 4, 'Świetny kurs')
        expect(result.success).toBe(true)
        expect(currentClient._tables.course_ratings).toHaveLength(1)
        expect(currentClient._tables.course_ratings[0].rating).toBe(4)
        expect(currentClient._tables.course_ratings[0].comment).toBe('Świetny kurs')
    })
})

// ============================================================
// getMyEnrollments
// ============================================================
describe('getMyEnrollments', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { getMyEnrollments } = await import('../course-learning')
        const result = await getMyEnrollments()
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('returns empty when no enrollments', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { course_enrollments: [] },
        })
        const { getMyEnrollments } = await import('../course-learning')
        const result = await getMyEnrollments()
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toEqual([])
    })

    it('computes progress percent based on completed_lessons / total_lessons', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                course_enrollments: [
                    {
                        id: 'e1',
                        user_id: 'u1',
                        course_id: 'c1',
                        enrolled_at: '2026-04-28T00:00:00Z',
                        completed_lessons: ['l1', 'l2'],
                        completed_at: null,
                        points_awarded: false,
                    },
                ],
                courses: [{ id: 'c1', author_id: 'a1', slug: 'k', status: 'published', title: 'T', tags: [], category: 'frontend', level: 'beginner' }],
                course_lessons: [
                    { id: 'l1', course_id: 'c1' },
                    { id: 'l2', course_id: 'c1' },
                    { id: 'l3', course_id: 'c1' },
                    { id: 'l4', course_id: 'c1' },
                ],
            },
        })
        const { getMyEnrollments } = await import('../course-learning')
        const result = await getMyEnrollments()
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toHaveLength(1)
            expect(result.data[0].progress_percent).toBe(50)
            expect(result.data[0].total_lessons).toBe(4)
        }
    })
})
