import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CourseCard } from '@/components/academy/course/CourseCard'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getAcademyPrerequisiteStatus } from '@/lib/actions/academy-discovery'
import { listAcademyRunPage } from '@/lib/actions/academy-sessions'
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
    const needsEdition = (course.delivery_mode ?? 'self_paced') !== 'self_paced' && !course.run_id
    const [prerequisites, nearest] = await Promise.all([
        getAcademyPrerequisiteStatus({ courseId: course.id, enrollmentId: course.enrollment_id ?? undefined }),
        needsEdition ? listAcademyRunPage({ scope: 'catalog', courseIds: [course.id], windowStart: new Date().toISOString(), pageSize: 1 }) : null,
    ])

    return <AcademyShell activeTab="catalog" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title={course.title} hideHeader>
        <CourseCard course={course}
            prerequisites={prerequisites.success ? prerequisites.data : undefined} prerequisitesError={prerequisites.success ? undefined : prerequisites.error}
            nearestRun={nearest?.success ? nearest.data.items[0] ?? null : null} nearestRunFailed={nearest ? !nearest.success : false} />
    </AcademyShell>
}
