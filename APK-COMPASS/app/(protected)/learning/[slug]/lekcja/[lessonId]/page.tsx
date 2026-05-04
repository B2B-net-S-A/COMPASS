import { redirect, notFound } from 'next/navigation'
import { LessonPlayer } from '@/components/learning/LessonPlayer'
import { getCourseDetail, getCourseLessons } from '@/lib/actions/courses'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string; lessonId: string }
}

export default async function LessonPage({ params }: PageProps) {
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

    // Pull completed lessons
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

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto">
            <LessonPlayer
                courseId={course.id}
                courseSlug={course.slug}
                lesson={lesson}
                allLessons={lessons}
                completedLessonIds={completedIds}
                quizAvailable={course.quiz_questions_count > 0}
            />
        </div>
    )
}
