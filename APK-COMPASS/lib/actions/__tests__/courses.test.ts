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
// createCourse
// ============================================================
describe('createCourse', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { createCourse } = await import('../courses')
        const result = await createCourse({ title: 'Test', category: 'frontend' })
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects when title is too short (<3 chars)', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { courses: [] },
        })
        const { createCourse } = await import('../courses')
        const result = await createCourse({ title: 'AB', category: 'frontend' })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/co najmniej 3 znaki/)
    })

    it('rejects when category is missing', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { courses: [] },
        })
        const { createCourse } = await import('../courses')
        const result = await createCourse({ title: 'Valid title', category: '   ' })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/Kategoria/)
    })

    it('creates course as draft with author_id from auth user and unique slug', async () => {
        setupClient({
            user: { id: 'u-author', email: 'author@x.com' },
            tables: { courses: [] },
        })
        const { createCourse } = await import('../courses')
        const result = await createCourse({
            title: 'Wprowadzenie do TypeScript',
            description: 'Podstawy języka',
            category: 'frontend',
            tags: ['typescript', 'fundamentals'],
            level: 'beginner',
        })

        expect(result.success).toBe(true)
        const inserted = currentClient._tables.courses[0]
        expect(inserted.author_id).toBe('u-author')
        expect(inserted.title).toBe('Wprowadzenie do TypeScript')
        expect(inserted.status).toBe('draft')
        expect(inserted.tags).toEqual(['typescript', 'fundamentals'])
        // Polskie znaki zsanityzowane → ascii + losowy sufiks
        expect(inserted.slug).toMatch(/^wprowadzenie-do-typescript-[a-z0-9]+$/)
    })

    it('strips Polish diacritics in slug', async () => {
        setupClient({
            user: { id: 'u-author', email: 'author@x.com' },
            tables: { courses: [] },
        })
        const { createCourse } = await import('../courses')
        const result = await createCourse({ title: 'Łatwa ścieżka — żonglowanie', category: 'soft-skills' })
        expect(result.success).toBe(true)
        const inserted = currentClient._tables.courses[0]
        expect(inserted.slug).toMatch(/^latwa-sciezka-zonglowanie-[a-z0-9]+$/)
    })

    it('defaults level to beginner when not provided', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { courses: [] },
        })
        const { createCourse } = await import('../courses')
        const result = await createCourse({ title: 'Test course title', category: 'cloud' })
        expect(result.success).toBe(true)
        expect(currentClient._tables.courses[0].level).toBe('beginner')
    })
})

// ============================================================
// updateCourse
// ============================================================
describe('updateCourse', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { updateCourse } = await import('../courses')
        const result = await updateCourse('c1', { title: 'New title' })
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('rejects when course does not exist', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { profiles: [{ id: 'u1', role: 'consultant' }], courses: [] },
        })
        const { updateCourse } = await import('../courses')
        const result = await updateCourse('nonexistent-id', { title: 'New title' })
        expect(result).toEqual({ success: false, error: 'Kurs nie istnieje' })
    })

    it('rejects when caller is neither author nor admin', async () => {
        setupClient({
            user: { id: 'u-other', email: 'other@x.com' },
            tables: {
                profiles: [{ id: 'u-other', role: 'consultant' }],
                courses: [{ id: 'c1', author_id: 'u-author', slug: 'kurs-1', status: 'draft' }],
            },
        })
        const { updateCourse } = await import('../courses')
        const result = await updateCourse('c1', { title: 'Hacked title' })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/Brak uprawnień/)
    })

    it('allows author to update own course', async () => {
        setupClient({
            user: { id: 'u-author', email: 'author@x.com' },
            tables: {
                profiles: [{ id: 'u-author', role: 'consultant' }],
                courses: [{ id: 'c1', author_id: 'u-author', slug: 'kurs-1', status: 'draft', title: 'Old' }],
            },
        })
        const { updateCourse } = await import('../courses')
        const result = await updateCourse('c1', { title: 'New title' })
        expect(result.success).toBe(true)
        expect(currentClient._tables.courses[0].title).toBe('New title')
    })

    it.each(['admin', 'administrator', 'centrala'])('allows %s to update any course', async (role) => {
        setupClient({
            user: { id: 'u-admin', email: 'admin@x.com' },
            tables: {
                profiles: [{ id: 'u-admin', role }],
                courses: [{ id: 'c1', author_id: 'u-someone', slug: 'kurs-1', status: 'draft', title: 'Old' }],
            },
        })
        const { updateCourse } = await import('../courses')
        const result = await updateCourse('c1', { title: 'Admin updated' })
        expect(result.success).toBe(true)
        expect(currentClient._tables.courses[0].title).toBe('Admin updated')
    })

    it('rejects update with title < 3 chars', async () => {
        setupClient({
            user: { id: 'u-author', email: 'author@x.com' },
            tables: {
                profiles: [{ id: 'u-author', role: 'consultant' }],
                courses: [{ id: 'c1', author_id: 'u-author', slug: 'kurs-1', status: 'draft' }],
            },
        })
        const { updateCourse } = await import('../courses')
        const result = await updateCourse('c1', { title: 'AB' })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/co najmniej 3 znaki/)
    })
})

// ============================================================
// getMyCourses
// ============================================================
describe('getMyCourses', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { getMyCourses } = await import('../courses')
        const result = await getMyCourses()
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('returns only courses where author_id = current user', async () => {
        setupClient({
            user: { id: 'u-me', email: 'me@x.com' },
            tables: {
                courses: [
                    { id: 'c1', author_id: 'u-me', title: 'Mine 1', status: 'draft', updated_at: '2026-04-29T12:00:00Z' },
                    { id: 'c2', author_id: 'u-other', title: 'Theirs', status: 'published', updated_at: '2026-04-28T12:00:00Z' },
                    { id: 'c3', author_id: 'u-me', title: 'Mine 2', status: 'published', updated_at: '2026-04-27T12:00:00Z' },
                ],
            },
        })
        const { getMyCourses } = await import('../courses')
        const result = await getMyCourses()
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toHaveLength(2)
            expect(result.data.every((c) => c.author_id === 'u-me')).toBe(true)
        }
    })
})

// ============================================================
// listPublishedCourses
// ============================================================
describe('listPublishedCourses', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { listPublishedCourses } = await import('../courses')
        const result = await listPublishedCourses({})
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('returns only published courses', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                courses: [
                    { id: 'c1', author_id: 'a1', title: 'Pub 1', status: 'published', tags: [], category: 'frontend', level: 'beginner', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0, published_at: '2026-04-28T00:00:00Z' },
                    { id: 'c2', author_id: 'a2', title: 'Draft 1', status: 'draft', tags: [], category: 'frontend', level: 'beginner', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0 },
                    { id: 'c3', author_id: 'a3', title: 'Pub 2', status: 'published', tags: [], category: 'cloud', level: 'intermediate', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0, published_at: '2026-04-29T00:00:00Z' },
                ],
                profiles: [
                    { id: 'a1', full_name: 'Anna A.', avatar_url: null },
                    { id: 'a3', full_name: 'Bartek B.', avatar_url: null },
                ],
            },
        })
        const { listPublishedCourses } = await import('../courses')
        const result = await listPublishedCourses({})
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.items).toHaveLength(2)
            expect(result.data.items.every((c) => c.status === 'published')).toBe(true)
        }
    })

    it('filters by category', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: {
                courses: [
                    { id: 'c1', author_id: 'a1', title: 'FE', status: 'published', tags: [], category: 'frontend', level: 'beginner', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0 },
                    { id: 'c2', author_id: 'a2', title: 'CL', status: 'published', tags: [], category: 'cloud', level: 'beginner', avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0 },
                ],
                profiles: [
                    { id: 'a1', full_name: 'A', avatar_url: null },
                    { id: 'a2', full_name: 'B', avatar_url: null },
                ],
            },
        })
        const { listPublishedCourses } = await import('../courses')
        const result = await listPublishedCourses({ category: 'cloud' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.items).toHaveLength(1)
            expect(result.data.items[0].category).toBe('cloud')
        }
    })
})

// ============================================================
// getCourseDetail
// ============================================================
describe('getCourseDetail', () => {
    it('rejects when not authenticated', async () => {
        setupClient({ user: null })
        const { getCourseDetail } = await import('../courses')
        const result = await getCourseDetail('some-slug')
        expect(result).toEqual({ success: false, error: 'Brak autoryzacji' })
    })

    it('returns 404-like error when course not found', async () => {
        setupClient({
            user: { id: 'u1', email: 'u@x.com' },
            tables: { courses: [] },
        })
        const { getCourseDetail } = await import('../courses')
        const result = await getCourseDetail('nonexistent-slug')
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toMatch(/nie istnieje|brak dostępu/i)
    })

    it('returns full detail when course exists', async () => {
        setupClient({
            user: { id: 'u-student', email: 'student@x.com' },
            tables: {
                courses: [
                    {
                        id: 'c1',
                        author_id: 'u-author',
                        slug: 'kurs-1',
                        title: 'Test Course',
                        description: 'Desc',
                        status: 'published',
                        category: 'frontend',
                        tags: ['react'],
                        level: 'beginner',
                        avg_rating: 4.5,
                        ratings_count: 2,
                        enrollments_count: 5,
                        completions_count: 3,
                        cover_image_url: null,
                        duration_minutes: 60,
                        rejection_reason: null,
                        reviewed_by: null,
                        reviewed_at: null,
                        published_at: '2026-04-28T00:00:00Z',
                        created_at: '2026-04-27T00:00:00Z',
                        updated_at: '2026-04-28T00:00:00Z',
                    },
                ],
                profiles: [{ id: 'u-author', full_name: 'Author A.', avatar_url: null }],
                course_lessons: [
                    { id: 'l1', course_id: 'c1', order_index: 0, title: 'Lekcja 1', content_md: '# Hello', video_url: null, attachments: [], estimated_minutes: 15 },
                ],
                course_quiz_questions: [{ id: 'q1', course_id: 'c1', order_index: 0, question_text: 'Q1?' }],
                course_enrollments: [],
                course_ratings: [],
            },
        })
        const { getCourseDetail } = await import('../courses')
        const result = await getCourseDetail('kurs-1')
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.title).toBe('Test Course')
            expect(result.data.author_name).toBe('Author A.')
            expect(result.data.lessons).toHaveLength(1)
            expect(result.data.quiz_questions_count).toBe(1)
            expect(result.data.is_enrolled).toBe(false)
            expect(result.data.user_rating).toBeNull()
        }
    })
})
