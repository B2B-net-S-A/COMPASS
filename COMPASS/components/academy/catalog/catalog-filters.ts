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
    orderBy: NonNullable<ListCoursesFilters['orderBy']>
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
    return {
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
