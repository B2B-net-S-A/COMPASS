/**
 * Cache tag taxonomy dla Next.js `revalidateTag` / `unstable_cache`.
 *
 * Phase 18.9: foundation pod migrację z `revalidatePath` (hardcoded paths,
 * 159 wystąpień w lib/actions/) na `revalidateTag` (domain-based).
 *
 * Wzorzec użycia:
 *
 *   import { unstable_cache } from 'next/cache'
 *   import { CACHE_TAGS } from '@/lib/cache/tags'
 *
 *   const getCoursesList = unstable_cache(
 *       async () => {
 *           const supabase = createClient()
 *           const { data } = await supabase.from('courses').select('*')
 *           return data
 *       },
 *       ['courses-list'], // cache key parts
 *       { tags: [CACHE_TAGS.COURSES] },
 *   )
 *
 *   // W server action który zmienia kurs:
 *   await supabase.from('courses').update(...)
 *   revalidateTag(CACHE_TAGS.COURSES)
 *   // → wszystkie miejsca renderujące listę kursów się odświeżają,
 *   //   bez wiedzy KTÓRE strony to są (revalidatePath wymagał)
 *
 * Per-user tagi:
 *
 *   tags: [CACHE_TAGS.USER_PROFILE, profile(userId)]
 *   // Tag-specific: revalidateTag(profile('abc-123'))
 *
 * Migracja: każdy nowy server action używający revalidateTag zamiast
 * revalidatePath. Stare callsites zostają — wymianę robimy gdy edytujemy plik.
 */

export const CACHE_TAGS = {
    // Per-domain tags (globalne — invalidate'uje wszystkie views w domenie).
    COURSES: 'courses',
    PROFILES: 'profiles',
    PROJECTS: 'projects',
    NEWS: 'news',
    SUPPORT: 'support',
    NOTIFICATIONS: 'notifications',
    LOYALTY: 'loyalty',
    LEAVE: 'leave',
    TIMESHEET: 'timesheet',
    INCUBATOR: 'incubator',
    DOCUMENTS: 'documents',
    KNOWLEDGE_BASE: 'knowledge-base',
    LEARNING_PATHS: 'learning-paths',
    WORK_CLOCK: 'work-clock',
} as const

/**
 * Per-entity tag — używany gdy chcesz invalidate'ować tylko jeden rekord.
 *
 *   tags: [profileTag(userId)]   // cache per-user profile
 *   revalidateTag(profileTag(userId))   // refresh tylko ten user
 */
export const profileTag = (userId: string) => `profile:${userId}` as const
export const courseTag = (courseId: string) => `course:${courseId}` as const
export const projectTag = (projectId: string) => `project:${projectId}` as const
export const ticketTag = (ticketId: string) => `ticket:${ticketId}` as const

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS]
