import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CourseCard } from '@/components/academy/course/CourseCard'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getAcademyPrerequisiteStatus } from '@/lib/actions/academy-discovery'
import { getAcademyRun, listAcademyRunPage } from '@/lib/actions/academy-sessions'
import { getCourseDetail } from '@/lib/actions/courses'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
    searchParams: { enrollment?: string }
}

export default async function CourseDetailPage({ params, searchParams }: PageProps) {
    const [access, result] = await Promise.all([getAcademyAccess(), getCourseDetail(params.slug, { enrollmentId: searchParams.enrollment })])
    if (!result.success) notFound()
    const course = result.data
    const live = (course.delivery_mode ?? 'self_paced') !== 'self_paced'
    const now = new Date().toISOString()
    const [prerequisites, nearest, ownRun] = await Promise.all([
        getAcademyPrerequisiteStatus({ courseId: course.id, enrollmentId: course.enrollment_id ?? undefined }),
        live && !course.run_id ? listAcademyRunPage({ scope: 'catalog', courseIds: [course.id], windowStart: now, pageSize: 1 }) : null,
        course.run_id ? getAcademyRun(course.run_id) : null,
    ])
    const edition = ownRun ?? nearest
    const editionRun = ownRun?.success ? ownRun.data : nearest?.success ? nearest.data.items[0] ?? null : null

    return <AcademyShell activeTab="catalog" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title={course.title} hideHeader>
        <CourseCard course={course}
            prerequisites={prerequisites.success ? prerequisites.data : undefined} prerequisitesError={prerequisites.success ? undefined : prerequisites.error}
            nearestRun={editionRun} nearestRunFailed={edition ? !edition.success : false} now={now} />
    </AcademyShell>
}
