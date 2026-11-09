import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { LessonPlayer } from '@/components/learning/LessonPlayer'
import { CourseQA } from '@/components/learning/CourseQA'
import { getCourseDetail } from '@/lib/actions/courses'
import { recordLessonAccess } from '@/lib/actions/course-learning'
import { getLessonVideoProgress } from '@/lib/actions/academy-video-progress'
import { academyCourseHref } from '@/lib/academy/navigation'

export const dynamic = 'force-dynamic'

export default async function LessonPage({ params, searchParams }: {
    params: { slug: string; lessonId: string }
    searchParams: { enrollment?: string }
}) {
    const result = await getCourseDetail(params.slug, { enrollmentId: searchParams.enrollment })
    if (!result.success) notFound()
    const course = result.data
    if (!course.enrollment_id) redirect(academyCourseHref(course.slug))
    const enrollmentId = course.enrollment_id
    const lessons = course.lessons
    const completedIds = course.completed_lesson_ids ?? []
    const completionDates = course.lesson_completion_dates ?? {}
    const backHref = academyCourseHref(course.slug, enrollmentId)
    if (!lessons.length) redirect(backHref)
    if (params.lessonId === 'first') {
        const target = lessons.find(lesson => !completedIds.includes(lesson.id)) ?? lessons[0]
        redirect(academyCourseHref(course.slug, enrollmentId, `/lekcja/${target.id}`))
    }
    const lesson = lessons.find(item => item.id === params.lessonId)
    if (!lesson) notFound()
    const index = lessons.findIndex(item => item.id === lesson.id)
    const previous = lessons[index - 1]
    const previousDate = previous && completionDates[previous.id]
    const unlockAt = previousDate ? new Date(previousDate).getTime() + lesson.unlock_after_days * 86400000 : null
    const locked = lesson.content_available === false || (!course.completed_at && !completedIds.includes(lesson.id) && lesson.unlock_after_days > 0 && previous && (!unlockAt || unlockAt > Date.now()))
    if (locked) return <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Link href={backHref} className="text-sm text-primary">← Powrót do szkolenia</Link>
        <h1 className="text-2xl font-semibold">{lesson.title}</h1>
        <p className="text-muted-foreground">{unlockAt && unlockAt > Date.now()
            ? `Lekcja będzie dostępna ${new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(unlockAt)}.`
            : 'Ta lekcja nie jest jeszcze dostępna. Ukończ wcześniejsze wymagane materiały i sprawdź warunki dostępu do swojej edycji.'}</p>
    </div>

    await recordLessonAccess(course.id, lesson.id, enrollmentId)
    const videoIds = lesson.attachments.filter(item => item.mime_type === 'video/mp4' && item.asset_id).map(item => item.asset_id as string)
    const progress = await getLessonVideoProgress(videoIds)
    const videoProgress = progress?.success ? progress.data : { available: false, items: {} }
    return <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        {course.source_run_id && <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><p className="font-semibold">Nie było Cię na żywo? Ten sam program, w Twoim tempie</p><p className="mt-1 text-muted-foreground">Przechodzisz ten sam zakres, podzielony na krótkie moduły. Ukończone moduły zostają zapisane, więc możesz wrócić, kiedy chcesz.</p></section>}
        <LessonPlayer key={`${enrollmentId}:${lesson.id}`} courseId={course.id} courseSlug={course.slug}
            enrollmentId={enrollmentId} completedAt={course.completed_at} revokedAt={course.completion_revoked_at} revokedReason={course.completion_revoked_reason} lesson={lesson} allLessons={lessons}
            completedLessonIds={completedIds} quizAvailable={course.quiz_questions_count > 0}
            videoProgress={videoProgress} videoWatchPercent={course.completion_rules?.video_watch_percent} />
        <CourseQA courseId={course.id} lessonId={lesson.id} enrollmentId={enrollmentId} />
    </div>
}
