import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CourseCatalog } from '@/components/academy/CourseCatalog'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listPublishedCourses } from '@/lib/actions/courses'
import { getAcademyCatalogOptions } from '@/lib/actions/academy-discovery'
import { listAcademyRuns } from '@/lib/actions/academy-sessions'
import { getCatalogNextRuns } from '@/components/academy/catalog/catalog-runs'
import {
    CATALOG_PAGE_SIZE,
    catalogHref,
    parseCatalogFilters,
    parseCatalogPage,
    type CatalogSearchParams,
} from '@/components/academy/catalog/catalog-filters'

export const dynamic = 'force-dynamic'

export default async function AkademiaPage({ searchParams }: { searchParams: CatalogSearchParams }) {
    const filters = parseCatalogFilters(searchParams)
    const page = parseCatalogPage(searchParams.page)
    const [accessResult, result, options, runs] = await Promise.all([
        getAcademyAccess(),
        listPublishedCourses({
            search: filters.search || undefined,
            category: filters.category,
            instructor_id: filters.instructorId,
            course_type: filters.courseType,
            level: filters.level,
            delivery_mode: filters.deliveryMode,
            orderBy: filters.orderBy,
            page,
            limit: CATALOG_PAGE_SIZE,
        }),
        getAcademyCatalogOptions(),
        listAcademyRuns(),
    ])

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
                nextRuns={runs.success ? getCatalogNextRuns(runs.data, new Date().toISOString()) : undefined}
                discoveryError={!options.success || !runs.success ? 'Część filtrów lub terminów jest chwilowo niedostępna. Odśwież stronę, aby spróbować ponownie.' : undefined}
            />
        </AcademyShell>
    )
}
