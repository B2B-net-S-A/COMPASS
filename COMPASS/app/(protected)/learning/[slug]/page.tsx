import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CourseCard } from '@/components/academy/course/CourseCard'
import { CourseRecordingSection } from '@/components/academy/library/CourseRecordingSection'
import { academyCourseHref } from '@/lib/academy/navigation'
import { pickRecording } from '@/lib/academy/recording-library'
import { getCourseRecordings } from '@/lib/actions/academy-recordings'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getAcademyPrerequisiteStatus } from '@/lib/actions/academy-discovery'
import { getAcademyRun, listAcademyRunPage } from '@/lib/actions/academy-sessions'
import { getCourseDetail } from '@/lib/actions/courses'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
    searchParams: { enrollment?: string; nagranie?: string }
}

export default async function CourseDetailPage({ params, searchParams }: PageProps) {
    const [access, result] = await Promise.all([getAcademyAccess(), getCourseDetail(params.slug, { enrollmentId: searchParams.enrollment })])
    if (!result.success) notFound()
    const course = result.data
    const live = (course.delivery_mode ?? 'self_paced') !== 'self_paced'
    const now = new Date().toISOString()
    const [prerequisites, nearest, ownRun, recordings] = await Promise.all([
        getAcademyPrerequisiteStatus({ courseId: course.id, enrollmentId: course.enrollment_id ?? undefined }),
        live && !course.run_id ? listAcademyRunPage({ scope: 'catalog', courseIds: [course.id], windowStart: now, pageSize: 1 }) : null,
        course.run_id ? getAcademyRun(course.run_id) : null,
        getCourseRecordings(course.id),
    ])
    // Nagranie jest dodatkiem do karty: gdy go nie ma albo lista padła, strona wygląda jak dotąd.
    const recordingItems = recordings.success ? recordings.data.items : []
    const current = pickRecording(recordingItems, searchParams.nagranie)
    const edition = ownRun ?? nearest
    const editionRun = ownRun?.success ? ownRun.data : nearest?.success ? nearest.data.items[0] ?? null : null

    return <AcademyShell activeTab="catalog" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title={course.title} hideHeader>
        {current && recordings.success && <div className="mb-8"><CourseRecordingSection courseId={course.id} courseTitle={course.title}
            recordings={recordingItems} current={current} files={recordings.data.files} enrollmentId={course.enrollment_id}
            quizHref={course.is_enrolled && course.quiz_questions_count > 0 ? academyCourseHref(course.slug, course.enrollment_id, '/quiz') : null} /></div>}
        <CourseCard course={course}
            prerequisites={prerequisites.success ? prerequisites.data : undefined} prerequisitesError={prerequisites.success ? undefined : prerequisites.error}
            nearestRun={editionRun} nearestRunFailed={edition ? !edition.success : false} now={now} />
    </AcademyShell>
}
