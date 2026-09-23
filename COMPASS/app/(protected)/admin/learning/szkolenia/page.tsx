import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyAdminCourses } from '@/components/academy/AcademyAdminCourses'
import { listAcademyAdminCourses } from '@/lib/actions/courses-admin'
import { ACADEMY_COURSE_STATUS_LABELS, type AcademyAdminCourseStatus } from '@/lib/types/academy-admin'

export const dynamic = 'force-dynamic'

export default async function AdminCoursesPage({ searchParams }: { searchParams: { q?: string; status?: string; page?: string } }) {
    const search = typeof searchParams.q === 'string' ? searchParams.q.slice(0, 100).trim() : ''
    const status: AcademyAdminCourseStatus = typeof searchParams.status === 'string' && Object.hasOwn(ACADEMY_COURSE_STATUS_LABELS, searchParams.status) ? searchParams.status as AcademyAdminCourseStatus : 'all'
    const page = Math.min(10000, Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1))
    const result = await listAcademyAdminCourses({ search, status, page })
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Wszystkie szkolenia" description="Zarządzaj kursami we wszystkich stanach, także historycznymi i zarchiwizowanymi. Archiwizacja zatrzymuje nowe zapisy, zachowując dotychczasową naukę.">
        <AcademyAdminNav active="courses" />
        {result.success ? <AcademyAdminCourses key={`${search}:${status}:${page}`} result={result.data} search={search} status={status} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać szkoleń" description="Sprawdź uprawnienia administratora lub odśwież stronę i spróbuj ponownie." />}
    </AcademyShell>
}
