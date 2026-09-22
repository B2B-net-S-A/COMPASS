import { getAcademyCourseManagement } from '@/lib/actions/academy-staff'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyRunList } from '@/components/academy/sessions/AcademyRunList'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getCourseDetail } from '@/lib/actions/courses'
import { listAcademyRuns } from '@/lib/actions/academy-sessions'

export const dynamic = 'force-dynamic'

export default async function CourseRunsPage({ params }: { params: { id: string } }) {
    const [access, course, runs, management] = await Promise.all([getAcademyAccess(), getCourseDetail(params.id), listAcademyRuns(params.id), getAcademyCourseManagement(params.id)])
    if (!course.success || !management.success || (!management.data.canLead && !(runs.success && runs.data.some(run => run.canManage)))) notFound()
    return <AcademyShell activeTab="teaching" showCalendar access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Edycje szkolenia" description={course.data.title} action={<Button asChild variant="outline"><Link href={management.data.canEdit ? `/learning/tworze/${course.data.id}/edit` : `/learning/${course.data.slug}`}><ArrowLeft aria-hidden="true" />Program szkolenia</Link></Button>}>{runs.success ? <AcademyRunList canCreate={management.data.canLead && !course.data.legacy_review_required} runs={runs.data.filter(run => run.canManage)} courseId={course.data.id} versionId={course.data.published_version_id ?? null} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać edycji" description="Odśwież stronę i spróbuj ponownie." />}</AcademyShell>
}
