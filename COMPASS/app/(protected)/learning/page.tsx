import Link from 'next/link'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyLibrary } from '@/components/academy/library/AcademyLibrary'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getAcademyCatalogTopics } from '@/lib/actions/academy-discovery'
import { listLibraryRecordings } from '@/lib/actions/academy-recordings'
import { listAcademyRunPage } from '@/lib/actions/academy-sessions'
import { listPublishedCourses } from '@/lib/actions/courses'
import { continueWatching, filterRecordings, nearestLive } from '@/lib/academy/recording-library'
import type { CatalogSearchParams } from '@/components/academy/catalog/catalog-filters'
import { CatalogPage } from './_katalog/catalog-page'

export const dynamic = 'force-dynamic'

/** Parametry pełnego katalogu: ich obecność (także z jego formularza) otwiera stary widok. */
const CATALOG_KEYS = ['widok', 'category', 'instructor', 'format', 'library', 'topic', 'level', 'type', 'sort', 'page']

function single(value: string | string[] | undefined): string {
    return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 100) ?? ''
}

export default async function AkademiaPage({ searchParams }: { searchParams: CatalogSearchParams }) {
    if (CATALOG_KEYS.some(key => key in searchParams)) return <CatalogPage searchParams={searchParams} />
    const search = single(searchParams.q)
    const topic = single(searchParams.temat) || undefined
    const now = new Date()
    const [accessResult, recordings, topics, courses, runs] = await Promise.all([
        getAcademyAccess(),
        listLibraryRecordings(),
        getAcademyCatalogTopics(),
        listPublishedCourses({ search: search || undefined, topic, page: 1, limit: 12 }),
        listAcademyRunPage({ scope: 'catalog', windowStart: now.toISOString(), pageSize: 10 }),
    ])
    const access = accessResult.success ? accessResult.data : { isAdmin: false, canTeach: false }
    const all = recordings.success ? recordings.data.items : []

    return <AcademyShell activeTab="catalog" access={access} title="Akademia"
        description="Nagrania i materiały z webinarów i szkoleń. Obejrzyj, kiedy chcesz, albo zapisz się na najbliższe na żywo."
        action={<Link href="/learning?widok=katalog" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Pełny katalog z filtrami</Link>}>
        <AcademyLibrary search={search} topic={topic} topics={topics.success ? topics.data : []}
            recordings={filterRecordings(all, { search, topic })} continueItems={continueWatching(all)}
            courses={courses.success ? courses.data.items : []}
            nextLive={runs.success ? nearestLive(runs.data.items, now.getTime()) : null}
            error={!recordings.success || !courses.success ? 'Część biblioteki jest chwilowo niedostępna. Odśwież stronę, aby spróbować ponownie.' : undefined} />
    </AcademyShell>
}
