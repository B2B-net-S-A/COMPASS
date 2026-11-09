import type { CourseDeliveryMode, CourseLevel, CourseType, ListCoursesFilters } from '@/lib/types/learning'

export const CATALOG_PAGE_SIZE = 12
export type CatalogDeliveryMode = CourseDeliveryMode
export type CatalogSearchParams = Record<string, string | string[] | undefined>

export interface CatalogFilters {
    search: string
    category?: string
    instructorId?: string
    level?: CourseLevel
    courseType?: CourseType
    deliveryMode?: CatalogDeliveryMode
    /** Library format from M10. It narrows by course content, not only by delivery mode. */
    libraryFormat?: LibraryFormat
    topic?: string
    orderBy: NonNullable<ListCoursesFilters['orderBy']>
}

export type LibraryFormat = 'video' | 'live' | 'materials' | 'test'

export const LIBRARY_FORMAT_LABELS: Record<LibraryFormat, string> = {
    video: 'Wideo',
    live: 'Na żywo',
    materials: 'Materiały',
    test: 'Test',
}

export interface LibrarySummary {
    modules: number
    minutes: number
    videos: number
    materials: number
}

export function matchesLibraryFormat(format: LibraryFormat, deliveryMode: string, summary: LibrarySummary | undefined): boolean {
    if (format === 'live') return deliveryMode === 'live'
    if (format === 'test') return deliveryMode === 'assessment'
    if (!summary) return false
    if (format === 'video') return summary.videos > 0
    return summary.videos === 0 && summary.materials > 0
}

export function formatLibrarySummary(summary: LibrarySummary): string {
    const moduleWord = summary.modules === 1 ? 'moduł' : summary.modules % 10 >= 2 && summary.modules % 10 <= 4 && (summary.modules % 100 < 10 || summary.modules % 100 >= 20) ? 'moduły' : 'modułów'
    const parts = [`${summary.modules} ${moduleWord}`]
    const duration = formatCourseDuration(summary.minutes)
    if (duration) parts.push(duration)
    return parts.join(', ')
}

export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
    beginner: 'Podstawowy',
    intermediate: 'Średniozaawansowany',
    advanced: 'Zaawansowany',
}

export const COURSE_FORMAT_LABELS: Record<CatalogDeliveryMode, string> = {
    self_paced: 'We własnym tempie',
    live: 'Na żywo w Teams',
    blended: 'Kurs mieszany',
}

function single(value: string | string[] | undefined): string {
    return typeof value === 'string' ? value : ''
}

export function parseCatalogFilters(params: CatalogSearchParams): CatalogFilters {
    const level = single(params.level)
    const source = single(params.type)
    const format = single(params.format)
    const sort = single(params.sort)
    const instructor = single(params.instructor)
    const library = single(params.library)
    return {
        libraryFormat: library === 'video' || library === 'live' || library === 'materials' || library === 'test' ? library : undefined,
        topic: single(params.topic).trim().slice(0, 100) || undefined,
        search: single(params.q).trim().slice(0, 200),
        category: single(params.category).trim().slice(0, 100) || undefined,
        instructorId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instructor) ? instructor : undefined,
        level: level === 'beginner' || level === 'intermediate' || level === 'advanced' ? level : undefined,
        courseType: source === 'company' || source === 'consultant' ? source : undefined,
        deliveryMode: format === 'self_paced' || format === 'live' || format === 'blended' ? format : undefined,
        orderBy: sort === 'popular' || sort === 'top_rated' ? sort : 'newest',
    }
}

export function parseCatalogPage(value: string | string[] | undefined): number {
    const page = Number(single(value))
    return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function catalogHref(filters: CatalogFilters, page = 1): string {
    const params = new URLSearchParams()
    if (filters.search) params.set('q', filters.search)
    if (filters.category) params.set('category', filters.category)
    if (filters.instructorId) params.set('instructor', filters.instructorId)
    if (filters.deliveryMode) params.set('format', filters.deliveryMode)
    if (filters.libraryFormat) params.set('library', filters.libraryFormat)
    if (filters.topic) params.set('topic', filters.topic)
    if (filters.level) params.set('level', filters.level)
    if (filters.courseType) params.set('type', filters.courseType)
    if (filters.orderBy !== 'newest') params.set('sort', filters.orderBy)
    if (page > 1) params.set('page', String(page))
    return params.size ? `/learning?${params.toString()}` : '/learning'
}

export function formatCourseDuration(minutes: number | null): string | null {
    if (!minutes || minutes <= 0) return null
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    if (!hours) return `${minutes} min`
    return remainder ? `${hours} godz. ${remainder} min` : `${hours} godz.`
}
