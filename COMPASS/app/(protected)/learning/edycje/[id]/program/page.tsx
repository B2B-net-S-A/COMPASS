import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CourseLearnerPreview } from '@/components/academy/CourseLearnerPreview'
import { CourseQA } from '@/components/learning/CourseQA'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getAcademyRun } from '@/lib/actions/academy-sessions'
import { getCourseDetail } from '@/lib/actions/courses'

export const dynamic = 'force-dynamic'

export default async function RunProgramPage({ params }: { params: { id: string } }) {
    const [access, result] = await Promise.all([getAcademyAccess(), getAcademyRun(params.id)])
    if (!access.success || !result.success || !result.data.canManage) notFound()
    const run = result.data
    const detail = await getCourseDetail(run.courseId, { previewVersionId: run.versionId })
    if (!detail.success) notFound()
    return <AcademyShell activeTab="teaching" showCalendar access={access.data} title="Program edycji" description={run.title} action={<Button asChild variant="outline"><Link href={`/learning/edycje/${run.id}`}>Wróć do edycji</Link></Button>}>
        <CourseLearnerPreview mode="instructor" course={detail.data} lessons={detail.data.lessons} quiz={[]} />
        <CourseQA key={run.versionId} courseId={run.courseId} previewVersionId={run.versionId} />
    </AcademyShell>
}
