import { redirect, notFound } from 'next/navigation'
import { LessonPlayer } from '@/components/learning/LessonPlayer'
import { CourseQA } from '@/components/learning/CourseQA'
import { getCourseDetail, getCourseLessons } from '@/lib/actions/courses'
import { recordLessonAccess } from '@/lib/actions/course-learning'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ slug: string; lessonId: string }>
}

export default async function LessonPage(props: PageProps) {
    const params = await props.params;
    const detailResult = await getCourseDetail(params.slug)
    if (!detailResult.success) notFound()
    const course = detailResult.data

    const lessonsResult = await getCourseLessons(course.id)
    const lessons = lessonsResult.success ? lessonsResult.data : []

    if (lessons.length === 0) {
        redirect(`/learning/${course.slug}`)
    }

    // 'first' keyword: redirect to first incomplete lesson, fallback to first lesson
    if (params.lessonId === 'first') {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        let completedIds: string[] = []
        if (user) {
            const { data: enrollment } = await supabase
                .from('course_enrollments')
                .select('completed_lessons')
                .eq('user_id', user.id)
                .eq('course_id', course.id)
                .maybeSingle()
            completedIds = Array.isArray(enrollment?.completed_lessons) ? (enrollment!.completed_lessons as string[]) : []
        }
        const firstIncomplete = lessons.find((l) => !completedIds.includes(l.id))
        const target = firstIncomplete ?? lessons[0]
        redirect(`/learning/${course.slug}/lekcja/${target.id}`)
    }

    const lesson = lessons.find((l) => l.id === params.lessonId)
    if (!lesson) notFound()

    if (!course.is_enrolled) {
        redirect(`/learning/${course.slug}`)
    }

    // Pull completed lessons + completion dates (do drip gating A2.4)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let completedIds: string[] = []
    let completionDates: Record<string, string> = {}
    if (user) {
        const { data: enrollment } = await supabase
            .from('course_enrollments')
            .select('completed_lessons, lesson_completion_dates')
            .eq('user_id', user.id)
            .eq('course_id', course.id)
            .maybeSingle<{
                completed_lessons: string[] | null
                lesson_completion_dates: Record<string, string> | null
            }>()
        completedIds = Array.isArray(enrollment?.completed_lessons) ? enrollment!.completed_lessons as string[] : []
        completionDates = enrollment?.lesson_completion_dates ?? {}

        // A1.1: zapisz że user właśnie wszedł do lekcji (dla "Kontynuuj naukę" na /home).
        // Fire-and-forget: nawet gdy się nie uda, nie blokuje render lekcji.
        await recordLessonAccess(course.id, lesson.id)
    }

    // A2.4: drip release gating — jeśli unlock_after_days > 0 i poprzednia lekcja
    // była completed mniej niż X dni temu, redirect z error message.
    const currentIdx = lessons.findIndex((l) => l.id === lesson.id)
    const lessonExt = lesson as typeof lesson & { unlock_after_days?: number }
    const unlockDays = lessonExt.unlock_after_days ?? 0
    if (unlockDays > 0 && currentIdx > 0 && !completedIds.includes(lesson.id)) {
        const prevLessonId = lessons[currentIdx - 1].id
        const prevCompletedIso = completionDates[prevLessonId]
        if (!prevCompletedIso) {
            // Poprzednia nie ukończona — redirect do course z hint
            redirect(`/learning/${course.slug}?error=prerequisite_lesson`)
        }
        const prevCompletedTs = new Date(prevCompletedIso).getTime()
        const unlockTs = prevCompletedTs + unlockDays * 24 * 60 * 60 * 1000
        if (Date.now() < unlockTs) {
            const daysLeft = Math.ceil((unlockTs - Date.now()) / (24 * 60 * 60 * 1000))
            redirect(`/learning/${course.slug}?locked_lesson=${encodeURIComponent(lesson.title)}&days_left=${daysLeft}`)
        }
    }

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <LessonPlayer
                courseId={course.id}
                courseSlug={course.slug}
                lesson={lesson}
                allLessons={lessons}
                completedLessonIds={completedIds}
                quizAvailable={course.quiz_questions_count > 0}
            />
            <CourseQA courseId={course.id} lessonId={lesson.id} />
        </div>
    )
}
