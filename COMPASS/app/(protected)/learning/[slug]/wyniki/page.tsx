import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Trophy, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RatingWidget } from '@/components/learning/RatingWidget'
import { CourseSurveyForm } from '@/components/learning/CourseSurveyForm'
import { CourseCompletion } from '@/components/academy/CourseCompletion'
import { getCourseDetail } from '@/lib/actions/courses'
import { getMyQuizResult } from '@/lib/actions/course-learning'
import { academyCourseHref } from '@/lib/academy/navigation'

export const dynamic = 'force-dynamic'

export default async function QuizResultsPage({ params, searchParams }: {
    params: { slug: string }; searchParams: { attempt?: string; enrollment?: string }
}) {
    const detail = await getCourseDetail(params.slug, { enrollmentId: searchParams.enrollment })
    if (!detail.success) notFound()
    const course = detail.data
    const backHref = academyCourseHref(course.slug, course.enrollment_id)
    // Old score/passed query parameters are never a source of completion evidence.
    if (!searchParams.attempt || !course.enrollment_id) redirect(backHref)
    const result = await getMyQuizResult(course.id, searchParams.attempt, course.enrollment_id)
    if (!result.success) notFound()
    const attempt = result.data
    return <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
        <Link href={backHref} className="text-sm text-primary">← {course.title}</Link>
        <Card className={attempt.passed ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}>
            <CardContent className="space-y-4 p-8 text-center">
                <Trophy aria-hidden className={`mx-auto h-16 w-16 ${attempt.passed ? 'text-success' : 'text-muted-foreground'}`} />
                <h1 className="text-3xl font-bold">{attempt.passed ? 'Quiz zaliczony' : 'Spróbuj ponownie'}</h1>
                <p className="text-5xl font-bold">{attempt.score}%</p>
                <p className="text-sm text-muted-foreground">Próg zaliczenia: {course.completion_rules?.quiz_pass_percent ?? 70}%</p>
                {attempt.passed && !attempt.completed && !course.completion_revoked_at && <p className="text-sm text-muted-foreground">Quiz jest zaliczony. Do ukończenia szkolenia pozostały inne wymagania, np. lekcje lub potwierdzenie obecności.</p>}
                {!attempt.passed && <Button asChild className="gap-2"><Link href={academyCourseHref(course.slug, course.enrollment_id, '/quiz')}><RefreshCw className="h-4 w-4" />Powtórz quiz</Link></Button>}
                <CourseCompletion courseId={course.id} enrollmentId={course.enrollment_id} completedAt={course.completed_at} revokedAt={course.completion_revoked_at} revokedReason={course.completion_revoked_reason} />
                <Button asChild variant="outline"><Link href={backHref}>Wróć do szkolenia</Link></Button>
            </CardContent>
        </Card>
        {attempt.completed && <>
            <RatingWidget courseId={course.id} initialRating={course.user_rating?.rating} initialComment={course.user_rating?.comment} />
            <CourseSurveyForm courseId={course.id} enrollmentId={course.enrollment_id} />
        </>}
    </div>
}
