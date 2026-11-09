import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CourseCatalog } from '@/components/academy/CourseCatalog'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listPublishedCourses } from '@/lib/actions/courses'
import { getAcademyCatalogOptions, getAcademyCatalogTopics, getAcademyLibrarySummary } from '@/lib/actions/academy-discovery'
import { listAcademyRunPage } from '@/lib/actions/academy-sessions'
import { getCatalogNextRuns } from '@/components/academy/catalog/catalog-runs'
import {
    CATALOG_PAGE_SIZE,
    catalogHref,
    matchesLibraryFormat,
    parseCatalogFilters,
    parseCatalogPage,
    type CatalogSearchParams,
} from '@/components/academy/catalog/catalog-filters'

export const dynamic = 'force-dynamic'

const LIBRARY_SCAN_SIZE = 50

export default async function AkademiaPage({ searchParams }: { searchParams: CatalogSearchParams }) {
    const filters = parseCatalogFilters(searchParams)
    const page = parseCatalogPage(searchParams.page)
    const listFilters = {
        search: filters.search || undefined,
        category: filters.category,
        instructor_id: filters.instructorId,
        course_type: filters.courseType,
        level: filters.level,
        delivery_mode: filters.deliveryMode,
        topic: filters.topic,
        orderBy: filters.orderBy,
    }
    const [accessResult, firstResult, options, topics] = await Promise.all([
        getAcademyAccess(),
        // A content format needs every matching course to page correctly after filtering.
        listPublishedCourses({ ...listFilters, page: filters.libraryFormat ? 1 : page, limit: filters.libraryFormat ? LIBRARY_SCAN_SIZE : CATALOG_PAGE_SIZE }),
        getAcademyCatalogOptions(),
        getAcademyCatalogTopics(),
    ])
    let result = firstResult
    const summaries = firstResult.success ? await getAcademyLibrarySummary(firstResult.data.items.map(course => course.id)) : null
    if (filters.libraryFormat && firstResult.success && summaries?.success && summaries.data.available) {
        const format = filters.libraryFormat
        const matching = firstResult.data.items.filter(course => matchesLibraryFormat(format, course.delivery_mode ?? 'self_paced', summaries?.success ? summaries.data.items[course.id] : undefined))
        const start = (page - 1) * CATALOG_PAGE_SIZE
        result = { success: true, data: { items: matching.slice(start, start + CATALOG_PAGE_SIZE), total: matching.length } }
    }
    const librarySummaries = summaries?.success && summaries.data.available ? summaries.data.items : undefined
    const visibleIds = result.success ? result.data.items.map(course => course.id) : []
    const runs = visibleIds.length ? await listAcademyRunPage({ scope: 'catalog', courseIds: visibleIds, windowStart: new Date().toISOString(), pageSize: visibleIds.length }) : null

    const access = accessResult.success ? accessResult.data : { isAdmin: false, canTeach: false }
    const canTeach = access.isAdmin || access.canTeach

    if (result.success && page > Math.max(1, Math.ceil(result.data.total / CATALOG_PAGE_SIZE))) {
        redirect(catalogHref(filters, Math.max(1, Math.ceil(result.data.total / CATALOG_PAGE_SIZE))))
    }

    return (
        <AcademyShell
            activeTab="catalog"
            access={access}
            title="Akademia"
            description="Wybierz szkolenie dla siebie. Ucz się we własnym tempie lub dołącz do zajęć z prowadzącym."
            action={canTeach ? (
                <Button asChild className="h-11 rounded-xl px-5">
                    <Link href="/learning/tworze/nowy"><Plus aria-hidden="true" /> Nowe szkolenie</Link>
                </Button>
            ) : undefined}
        >
            <CourseCatalog
                filters={filters}
                page={page}
                courses={result.success ? result.data.items : []}
                total={result.success ? result.data.total : 0}
                error={result.success ? undefined : result.error}
                canTeach={canTeach}
                options={options.success ? options.data : undefined}
                topics={topics.success ? topics.data : []}
                librarySummaries={librarySummaries}
                nextRuns={runs?.success ? getCatalogNextRuns(runs.data.items, new Date().toISOString()) : undefined}
                discoveryError={!options.success || (runs !== null && !runs.success) ? 'Część filtrów lub terminów jest chwilowo niedostępna. Odśwież stronę, aby spróbować ponownie.' : undefined}
            />
        </AcademyShell>
    )
}
