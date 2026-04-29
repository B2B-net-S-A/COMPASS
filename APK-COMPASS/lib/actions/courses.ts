'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// Types
// ============================================================
export type CourseStatus = 'draft' | 'pending_review' | 'published' | 'archived' | 'rejected'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'

export interface Course {
    id: string
    author_id: string
    title: string
    slug: string
    description: string | null
    cover_image_url: string | null
    category: string
    tags: string[]
    level: CourseLevel
    duration_minutes: number | null
    status: CourseStatus
    rejection_reason: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    published_at: string | null
    avg_rating: number
    ratings_count: number
    enrollments_count: number
    completions_count: number
    created_at: string
    updated_at: string
}

export interface CourseListItem extends Course {
    author_name: string | null
    author_avatar_url: string | null
}

export interface CourseLesson {
    id: string
    course_id: string
    order_index: number
    title: string
    content_md: string | null
    video_url: string | null
    attachments: CourseAttachment[]
    estimated_minutes: number | null
}

export interface CourseAttachment {
    name: string
    storage_path: string
    size_bytes: number
}

export interface CourseQuizQuestionPublic {
    id: string
    order_index: number
    question_text: string
    options_count: number
}

export interface CourseDetail extends Course {
    author_name: string | null
    author_avatar_url: string | null
    lessons: CourseLesson[]
    quiz_questions_count: number
    is_enrolled: boolean
    user_rating: { rating: number; comment: string | null } | null
}

export interface CreateCourseInput {
    title: string
    description?: string
    category: string
    tags?: string[]
    level?: CourseLevel
    duration_minutes?: number
}

export interface UpdateCoursePatch {
    title?: string
    description?: string | null
    category?: string
    tags?: string[]
    level?: CourseLevel
    duration_minutes?: number | null
    cover_image_url?: string | null
}

export interface ListCoursesFilters {
    category?: string
    tag?: string
    level?: CourseLevel
    search?: string
    page?: number
    limit?: number
    orderBy?: 'newest' | 'popular' | 'top_rated'
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// ============================================================
// Helpers
// ============================================================
const SLUG_RANDOM_SUFFIX_LENGTH = 6

function slugifyTitle(title: string): string {
    const polishMap: Record<string, string> = {
        ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
        Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
    }
    const normalized = title
        .split('')
        .map((c) => polishMap[c] ?? c)
        .join('')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80)
    return normalized || 'kurs'
}

function randomSuffix(length = SLUG_RANDOM_SUFFIX_LENGTH): string {
    return Math.random().toString(36).slice(2, 2 + length)
}

async function isAdminOrCentrala(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
    const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
    const role = data?.role || ''
    return ['admin', 'administrator', 'centrala'].includes(role)
}

// ============================================================
// Server Actions — author + catalog
// ============================================================

/**
 * Tworzy nowy kurs (status = draft). Każdy authenticated może utworzyć — autorem
 * staje się aktualny user. Slug generowany ze zsanityzowanego tytułu + losowy sufiks.
 */
export async function createCourse(input: CreateCourseInput): Promise<ActionResult<{ courseId: string; slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        if (!input.title || input.title.trim().length < 3) {
            return { success: false, error: 'Tytuł musi mieć co najmniej 3 znaki' }
        }
        if (!input.category || input.category.trim().length === 0) {
            return { success: false, error: 'Kategoria jest wymagana' }
        }

        // Slug: zsanityzowany tytuł + losowy sufiks (zawsze unikalny — bez kolizji)
        const slug = `${slugifyTitle(input.title)}-${randomSuffix()}`

        const { data, error } = await supabase
            .from('courses')
            .insert({
                author_id: user.id,
                title: input.title.trim(),
                slug,
                description: input.description?.trim() || null,
                category: input.category.trim(),
                tags: input.tags ?? [],
                level: input.level ?? 'beginner',
                duration_minutes: input.duration_minutes ?? null,
                status: 'draft',
            })
            .select('id, slug')
            .single()

        if (error) throw error

        revalidatePath('/akademia')
        revalidatePath('/akademia/tworze')
        return { success: true, data: { courseId: data.id, slug: data.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd tworzenia kursu'
        console.error('[createCourse]', error)
        return { success: false, error: msg }
    }
}

/**
 * Aktualizuje metadane kursu. Tylko autor (lub admin/centrala) może edytować.
 * Kurs w stanie `published` można edytować bez re-submit (do dyskusji w fazie 2).
 */
export async function updateCourse(courseId: string, patch: UpdateCoursePatch): Promise<ActionResult<{ slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: course, error: fetchError } = await supabase
            .from('courses')
            .select('id, author_id, slug, status')
            .eq('id', courseId)
            .single()
        if (fetchError || !course) return { success: false, error: 'Kurs nie istnieje' }

        const isAdmin = await isAdminOrCentrala(supabase, user.id)
        if (course.author_id !== user.id && !isAdmin) {
            return { success: false, error: 'Brak uprawnień do edycji tego kursu' }
        }

        const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (patch.title !== undefined) {
            if (patch.title.trim().length < 3) return { success: false, error: 'Tytuł musi mieć co najmniej 3 znaki' }
            cleanPatch.title = patch.title.trim()
        }
        if (patch.description !== undefined) cleanPatch.description = patch.description?.trim() || null
        if (patch.category !== undefined) {
            if (!patch.category.trim()) return { success: false, error: 'Kategoria nie może być pusta' }
            cleanPatch.category = patch.category.trim()
        }
        if (patch.tags !== undefined) cleanPatch.tags = patch.tags
        if (patch.level !== undefined) cleanPatch.level = patch.level
        if (patch.duration_minutes !== undefined) cleanPatch.duration_minutes = patch.duration_minutes
        if (patch.cover_image_url !== undefined) cleanPatch.cover_image_url = patch.cover_image_url

        const { error: updateError } = await supabase
            .from('courses')
            .update(cleanPatch)
            .eq('id', courseId)

        if (updateError) throw updateError

        revalidatePath('/akademia')
        revalidatePath('/akademia/tworze')
        revalidatePath(`/akademia/${course.slug}`)
        return { success: true, data: { slug: course.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd aktualizacji kursu'
        console.error('[updateCourse]', error)
        return { success: false, error: msg }
    }
}

/**
 * Lista kursów aktualnego usera w roli autora (wszystkie statusy).
 */
export async function getMyCourses(): Promise<ActionResult<Course[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .eq('author_id', user.id)
            .order('updated_at', { ascending: false })

        if (error) throw error
        return { success: true, data: (data ?? []) as Course[] }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania kursów'
        console.error('[getMyCourses]', error)
        return { success: false, error: msg }
    }
}

/**
 * Katalog opublikowanych kursów. Filtry: kategoria, tag, poziom, search po tytule/opisie.
 * Sortowanie: newest (published_at desc), popular (enrollments_count desc), top_rated (avg_rating desc).
 */
export async function listPublishedCourses(filters: ListCoursesFilters = {}): Promise<ActionResult<{ items: CourseListItem[]; total: number }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const page = Math.max(1, filters.page ?? 1)
        const limit = Math.min(50, Math.max(1, filters.limit ?? 12))
        const from = (page - 1) * limit
        const to = from + limit - 1

        let query = supabase
            .from('courses')
            .select('*', { count: 'exact' })
            .eq('status', 'published')

        if (filters.category) query = query.eq('category', filters.category)
        if (filters.level) query = query.eq('level', filters.level)
        if (filters.tag) query = query.contains('tags', [filters.tag])
        if (filters.search && filters.search.trim().length > 0) {
            const s = `%${filters.search.trim()}%`
            query = query.or(`title.ilike.${s},description.ilike.${s}`)
        }

        switch (filters.orderBy) {
            case 'popular':
                query = query.order('enrollments_count', { ascending: false })
                break
            case 'top_rated':
                query = query.order('avg_rating', { ascending: false })
                break
            case 'newest':
            default:
                query = query.order('published_at', { ascending: false })
        }

        query = query.range(from, to)

        const { data, error, count } = await query
        if (error) throw error

        const courses = (data ?? []) as Course[]

        // Pull author profiles in a separate query (no Supabase embed → mockable)
        const authorIds = Array.from(new Set(courses.map((c) => c.author_id)))
        const authorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        if (authorIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', authorIds)
            for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) {
                authorMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
            }
        }

        const items: CourseListItem[] = courses.map((c) => ({
            ...c,
            author_name: authorMap.get(c.author_id)?.full_name ?? null,
            author_avatar_url: authorMap.get(c.author_id)?.avatar_url ?? null,
        }))

        return { success: true, data: { items, total: count ?? items.length } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania katalogu'
        console.error('[listPublishedCourses]', error)
        return { success: false, error: msg }
    }
}

/**
 * Szczegóły kursu po slug (lub UUID). Zwraca pełną listę lekcji + liczbę pytań quizu
 * (bez treści pytań i opcji — te ładujemy oddzielnie przez RPC `get_quiz_for_attempt`
 * w fazie 4). Ujawnia metadane visible-to-user wg RLS (published OR own OR admin).
 */
export async function getCourseDetail(slugOrId: string): Promise<ActionResult<CourseDetail>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)
        const filterField = isUuid ? 'id' : 'slug'

        const { data: courseRow, error: courseErr } = await supabase
            .from('courses')
            .select('*')
            .eq(filterField, slugOrId)
            .single()

        if (courseErr || !courseRow) return { success: false, error: 'Kurs nie istnieje lub brak dostępu' }

        const course = courseRow as Course

        // Author profile in a separate query (no embed → testable)
        const { data: authorProfile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', course.author_id)
            .maybeSingle()

        const { data: lessons, error: lessonsErr } = await supabase
            .from('course_lessons')
            .select('*')
            .eq('course_id', course.id)
            .order('order_index', { ascending: true })
        if (lessonsErr) throw lessonsErr

        const { count: quizCount, error: quizCountErr } = await supabase
            .from('course_quiz_questions')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', course.id)
        if (quizCountErr) throw quizCountErr

        const { data: enrollment } = await supabase
            .from('course_enrollments')
            .select('id')
            .eq('course_id', course.id)
            .eq('user_id', user.id)
            .maybeSingle()

        const { data: ratingRow } = await supabase
            .from('course_ratings')
            .select('rating, comment')
            .eq('course_id', course.id)
            .eq('user_id', user.id)
            .maybeSingle()

        const detail: CourseDetail = {
            ...course,
            author_name: (authorProfile as { full_name?: string } | null)?.full_name ?? null,
            author_avatar_url: (authorProfile as { avatar_url?: string } | null)?.avatar_url ?? null,
            lessons: ((lessons ?? []) as CourseLesson[]).map((l) => ({
                ...l,
                attachments: Array.isArray(l.attachments) ? l.attachments : [],
            })),
            quiz_questions_count: quizCount ?? 0,
            is_enrolled: !!enrollment,
            user_rating: ratingRow ? { rating: ratingRow.rating, comment: ratingRow.comment } : null,
        }

        return { success: true, data: detail }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania szczegółów kursu'
        console.error('[getCourseDetail]', error)
        return { success: false, error: msg }
    }
}
