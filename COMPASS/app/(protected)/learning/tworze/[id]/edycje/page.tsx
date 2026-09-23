import { getAcademyCourseManagement } from '@/lib/actions/academy-staff'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyRunList } from '@/components/academy/sessions/AcademyRunList'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getCourseDetail } from '@/lib/actions/courses'
import { listAcademyRunPage } from '@/lib/actions/academy-sessions'

export const dynamic = 'force-dynamic'

export default async function CourseRunsPage({ params, searchParams }: { params: { id: string }; searchParams: { page?: string } }) {
    const parsedPage = Number(searchParams.page)
    const page = Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 20_000_000 ? parsedPage : 1
    const [access, course, runs, management] = await Promise.all([getAcademyAccess(), getCourseDetail(params.id), listAcademyRunPage({ courseId: params.id, scope: 'managed', page }), getAcademyCourseManagement(params.id)])
    if (!course.success || !management.success || (!management.data.canLead && !management.data.hasAssignedRuns)) notFound()
    if (runs.success && page > 1 && runs.data.items.length === 0) redirect(`/learning/tworze/${course.data.id}/edycje`)
    return <AcademyShell activeTab="teaching" showCalendar access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Edycje szkolenia" description={course.data.title} action={<Button asChild variant="outline"><Link href={management.data.canEdit ? `/learning/tworze/${course.data.id}/edit` : `/learning/${course.data.slug}`}><ArrowLeft aria-hidden="true" />Program szkolenia</Link></Button>}>{runs.success ? <AcademyRunList canCreate={management.data.canLead && !course.data.legacy_review_required} runs={runs.data.items} page={page} hasMore={runs.data.hasMore} courseId={course.data.id} versionId={course.data.published_version_id ?? null} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać edycji" description="Odśwież stronę i spróbuj ponownie." />}</AcademyShell>
}
