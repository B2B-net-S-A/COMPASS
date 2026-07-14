'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { chatJSON } from '@/lib/ai/llm'
import type {
    ActionResult,
    Course,
    CourseListItem,
    RecommendedCourse,
} from '@/lib/types/learning'

// ============================================================
// A3.1 + A3.5 — Course embeddings + smart recommendations + smart search
// ============================================================

/**
 * Buduje canonical text reprezentujący kurs (title + description + tags + lessons preview).
 * Używane jako input do embedding model.
 */
function buildCourseEmbeddingText(course: {
    title: string
    description: string | null
    category: string
    tags: string[]
    level: string
}, lessonsPreview?: string): string {
    const parts = [
        `Tytuł: ${course.title}`,
        course.description ? `Opis: ${course.description}` : '',
        `Kategoria: ${course.category}`,
        course.tags.length > 0 ? `Tagi: ${course.tags.join(', ')}` : '',
        `Poziom: ${course.level}`,
        lessonsPreview ? `\nLekcje:\n${lessonsPreview}` : '',
    ]
    return parts.filter(Boolean).join('\n')
}

/**
 * A3.1: regeneruje embedding kursu (lub generuje pierwszy raz).
 * Idempotent — można wywołać wielokrotnie.
 * Wywoływane np. przez admin "Re-index courses" lub po zmianie content.
 */
export async function regenerateCourseEmbedding(courseId: string): Promise<ActionResult<{ generated: boolean }>> {
    try {
        const admin = createServiceClient()

        const { data: course } = await admin
            .from('courses')
            .select('id, title, description, category, tags, level')
            .eq('id', courseId)
            .single<{
                id: string
                title: string
                description: string | null
                category: string
                tags: string[]
                level: string
            }>()
        if (!course) return { success: false, error: 'Kurs nie istnieje' }

        const { data: lessons } = await admin
            .from('course_lessons')
            .select('title, content_md')
            .eq('course_id', courseId)
            .order('order_index')
        const lessonsPreview = ((lessons ?? []) as Array<{ title: string; content_md: string | null }>)
            .map((l) => `- ${l.title}${l.content_md ? `: ${l.content_md.slice(0, 200)}` : ''}`)
            .join('\n')

        const text = buildCourseEmbeddingText(course, lessonsPreview)
        const embedding = await generateEmbedding(text)

        const { error } = await admin
            .from('courses')
            .update({
                // pgvector column — Supabase JS akceptuje number[] w runtime,
                // ale DB types tipują jako `string | null` (vector serializuje
                // do "[1.2,3.4,...]" string format).
                embedding: embedding as unknown as string,
                embedding_generated_at: new Date().toISOString(),
            })
            .eq('id', courseId)
        if (error) throw error

        return { success: true, data: { generated: true } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd regeneracji embedding'
        logCompat.error('[regenerateCourseEmbedding]', error)
        return { success: false, error: msg }
    }
}

/**
 * A3.1: rekomendacje 2.0 — semantic match z embeddings zamiast text overlap.
 * Strategia:
 *   1. Pobierz user's profile embedding (jeśli istnieje) lub buduj z user gaps
 *   2. Wywołaj RPC match_courses z user query embedding
 *   3. Filtruj enrolled + own → top 12
 *   4. Fallback do tag overlap (legacy logika z course-learning.ts) gdy <3 results
 */
export async function getRecommendedCoursesV2(): Promise<
    ActionResult<{ items: RecommendedCourse[]; method: 'embeddings' | 'tag_overlap' | 'fallback_popular' }>
> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // 1. Build user query — z profile bio + skills + gaps
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, bio, skills')
            .eq('id', user.id)
            .single<{ full_name: string | null; bio: string | null; skills: string[] | null }>()

        const { getSkillGaps } = await import('./development')
        const gaps = await getSkillGaps()
        const missingSkills: string[] = []
        for (const g of gaps.gaps) {
            if (g.status === 'has_gaps') {
                missingSkills.push(...g.missingSkills)
            }
        }

        const userQuery = [
            profile?.bio ? `Bio: ${profile.bio}` : '',
            profile?.skills?.length ? `Aktualne umiejętności: ${profile.skills.join(', ')}` : '',
            missingSkills.length > 0
                ? `Chce się rozwijać w: ${Array.from(new Set(missingSkills)).join(', ')}`
                : '',
        ]
            .filter(Boolean)
            .join('\n')

        // Jeśli user nie ma żadnego kontekstu, fallback do popularnych
        if (userQuery.trim().length < 20) {
            return await fallbackPopular(supabase, user.id)
        }

        // 2. Generate embedding + call RPC
        const queryEmbedding = await generateEmbedding(userQuery)
        const { data: matches, error: matchErr } = await supabase.rpc('match_courses', {
            query_embedding: queryEmbedding as unknown as string,
            match_threshold: 0.3,
            match_count: 30,
        })

        if (matchErr) {
            logCompat.warn('[getRecommendedCoursesV2] match_courses RPC failed, fallback to tag overlap', matchErr)
            // Fallback do legacy
            const { getRecommendedCourses } = await import('./course-learning')
            const legacy = await getRecommendedCourses()
            if (legacy.success) {
                return {
                    success: true,
                    data: { items: legacy.data.items, method: 'tag_overlap' },
                }
            }
            return await fallbackPopular(supabase, user.id)
        }

        const matchRows = (matches ?? []) as Array<{ course_id: string; similarity: number }>
        if (matchRows.length === 0) {
            return await fallbackPopular(supabase, user.id)
        }

        // 3. Pull course details + filter
        const courseIds = matchRows.map((m) => m.course_id)
        const { data: courses } = await supabase
            .from('courses')
            .select('*')
            .in('id', courseIds)
        const courseMap = new Map<string, Course>()
        for (const c of (courses ?? []) as Course[]) courseMap.set(c.id, c)

        const { data: enrolls } = await supabase
            .from('course_enrollments')
            .select('course_id')
            .eq('user_id', user.id)
        const enrolledIds = new Set(
            ((enrolls ?? []) as Array<{ course_id: string }>).map((e) => e.course_id),
        )

        // Author info
        const authorIds = Array.from(new Set(Array.from(courseMap.values()).map((c) => c.author_id)))
        const { data: profiles } = await supabase
            .from('profile_directory')
            .select('id, full_name, avatar_url')
            .in('id', authorIds)
        const authorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        for (const p of (profiles ?? []) as Array<{
            id: string
            full_name: string | null
            avatar_url: string | null
        }>) {
            authorMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
        }

        const items: RecommendedCourse[] = matchRows
            .map((m) => {
                const c = courseMap.get(m.course_id)
                if (!c) return null
                if (enrolledIds.has(c.id) || c.author_id === user.id) return null
                const author = authorMap.get(c.author_id)
                const courseListItem: CourseListItem = {
                    ...c,
                    author_name: author?.full_name ?? null,
                    author_avatar_url: author?.avatar_url ?? null,
                }
                return {
                    course: courseListItem,
                    overlap_count: 0,
                    reason: `Dopasowane do Twojego profilu (similarity: ${(m.similarity * 100).toFixed(0)}%)`,
                }
            })
            .filter((x): x is RecommendedCourse => x !== null)
            .slice(0, 12)

        if (items.length < 3) {
            return await fallbackPopular(supabase, user.id)
        }

        return { success: true, data: { items, method: 'embeddings' } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd rekomendacji'
        logCompat.error('[getRecommendedCoursesV2]', error)
        return { success: false, error: msg }
    }
}

async function fallbackPopular(
    supabase: ReturnType<typeof createClient>,
    userId: string,
): Promise<
    ActionResult<{ items: RecommendedCourse[]; method: 'embeddings' | 'tag_overlap' | 'fallback_popular' }>
> {
    const { data: courses } = await supabase
        .from('courses')
        .select('*')
        .eq('status', 'published')
        .order('enrollments_count', { ascending: false })
        .limit(12)

    const { data: enrolls } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('user_id', userId)
    const enrolledIds = new Set(
        ((enrolls ?? []) as Array<{ course_id: string }>).map((e) => e.course_id),
    )

    const items: RecommendedCourse[] = ((courses ?? []) as Course[])
        .filter((c) => !enrolledIds.has(c.id) && c.author_id !== userId)
        .slice(0, 12)
        .map((c) => ({
            course: { ...c, author_name: null, author_avatar_url: null },
            overlap_count: 0,
            reason: 'Popularne wśród konsultantów',
        }))
    return { success: true, data: { items, method: 'fallback_popular' } }
}

/**
 * A3.5: Smart Search — naturalne pytania ("kurs o React Testing Library dla średniozaawansowanych")
 *
 * Pipeline:
 *  1. Claude Haiku — query parsing (extract: tags, level, category, intent)
 *  2. Voyage embedding na intent text
 *  3. RPC match_courses
 *  4. Post-filter wg parsed structured filters (level, category)
 */
interface ParsedQuery {
    intent: string
    tags?: string[]
    level?: 'beginner' | 'intermediate' | 'advanced'
    category?: string
}

export async function smartSearchCourses(
    rawQuery: string,
): Promise<ActionResult<{ items: CourseListItem[]; parsedQuery: ParsedQuery }>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        if (rawQuery.trim().length < 3) {
            return { success: false, error: 'Zapytanie musi mieć min 3 znaki.' }
        }

        // 1. Parse query za pomocą Haiku (low cost)
        const parsed = await chatJSON<ParsedQuery>({
            model: 'claude-haiku-4-5',
            maxTokens: 500,
            temperature: 0.1,
            system: `Jesteś asystentem wyszukiwania kursów online. Twoje zadanie: rozłóż zapytanie użytkownika na strukturyzowane filtry.

Zwróć JSON:
{
  "intent": "krótkie streszczenie tego czego user szuka (max 100 znaków)",
  "tags": ["tag1", "tag2"] (opcjonalne, ekstraktowane technologie/słowa kluczowe),
  "level": "beginner" | "intermediate" | "advanced" (opcjonalne),
  "category": "..." (opcjonalne, np. "programowanie", "soft skills", "biznes")
}

Tylko pola które są w zapytaniu. Nie zmyślaj.`,
            messages: [
                {
                    role: 'user',
                    content: rawQuery,
                },
            ],
        })

        // 2. Embedding na intent
        const queryEmbedding = await generateEmbedding(parsed.intent || rawQuery)

        // 3. RPC match
        const { data: matches } = await supabase.rpc('match_courses', {
            query_embedding: queryEmbedding as unknown as string,
            match_threshold: 0.3,
            match_count: 30,
        })
        const matchRows = (matches ?? []) as Array<{ course_id: string; similarity: number }>

        if (matchRows.length === 0) {
            return { success: true, data: { items: [], parsedQuery: parsed } }
        }

        // 4. Pull + post-filter
        const courseIds = matchRows.map((m) => m.course_id)
        let q = supabase.from('courses').select('*').in('id', courseIds)
        if (parsed.level) q = q.eq('level', parsed.level)
        if (parsed.category) q = q.eq('category', parsed.category)
        const { data: courses } = await q

        // Author info
        const courseList = (courses ?? []) as Course[]
        const authorIds = Array.from(new Set(courseList.map((c) => c.author_id)))
        const { data: profiles } = await supabase
            .from('profile_directory')
            .select('id, full_name, avatar_url')
            .in('id', authorIds)
        const authorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        for (const p of (profiles ?? []) as Array<{
            id: string
            full_name: string | null
            avatar_url: string | null
        }>) {
            authorMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
        }

        // Sort by similarity (z RPC kolejność)
        const simMap = new Map(matchRows.map((m) => [m.course_id, m.similarity]))
        const items: CourseListItem[] = courseList
            .map((c) => ({
                ...c,
                author_name: authorMap.get(c.author_id)?.full_name ?? null,
                author_avatar_url: authorMap.get(c.author_id)?.avatar_url ?? null,
            }))
            .sort((a, b) => (simMap.get(b.id) ?? 0) - (simMap.get(a.id) ?? 0))
            .slice(0, 20)

        return { success: true, data: { items, parsedQuery: parsed } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd wyszukiwania'
        logCompat.error('[smartSearchCourses]', error)
        return { success: false, error: msg }
    }
}
