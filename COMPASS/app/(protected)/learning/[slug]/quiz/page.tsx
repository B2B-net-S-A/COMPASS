import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { QuizForm } from '@/components/learning/QuizForm'
import { Card, CardContent } from '@/components/ui/card'
import { getCourseDetail } from '@/lib/actions/courses'
import { getQuizForAttempt } from '@/lib/actions/course-learning'
import { academyCourseHref } from '@/lib/academy/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
    searchParams: { enrollment?: string }
}

export default async function QuizPage({ params, searchParams }: PageProps) {
    const detailResult = await getCourseDetail(params.slug, { enrollmentId: searchParams.enrollment })
    if (!detailResult.success) notFound()
    const course = detailResult.data

    if (!course.enrollment_id) {
        redirect(`/learning/${course.slug}`)
    }

    const quizResult = await getQuizForAttempt(course.id, course.enrollment_id)

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href={academyCourseHref(course.slug, course.enrollment_id)} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← {course.title}
                </Link>
                <div className="flex items-center gap-3">
                    <ListChecks className="w-7 h-7 text-primary" />
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Quiz końcowy</h1>
                </div>
            </div>

            {!quizResult.success && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{quizResult.error}</CardContent>
                </Card>
            )}

            {quizResult.success && quizResult.data.length === 0 && (
                <Card className="bg-warning/5 border-warning/20">
                    <CardContent className="p-6 text-sm text-warning">Quiz nie ma jeszcze pytań.</CardContent>
                </Card>
            )}

            {quizResult.success && quizResult.data.length > 0 && (
                <QuizForm key={course.enrollment_id} courseId={course.id} courseSlug={course.slug} enrollmentId={course.enrollment_id} passPercent={course.completion_rules?.quiz_pass_percent ?? 70} questions={quizResult.data} />
            )}
        </div>
    )
}
