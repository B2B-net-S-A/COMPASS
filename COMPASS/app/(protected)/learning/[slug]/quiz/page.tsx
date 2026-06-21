import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { QuizForm } from '@/components/learning/QuizForm'
import { Card, CardContent } from '@/components/ui/card'
import { getCourseDetail } from '@/lib/actions/courses'
import { getQuizForAttempt } from '@/lib/actions/course-learning'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
}

export default async function QuizPage({ params }: PageProps) {
    const detailResult = await getCourseDetail(params.slug)
    if (!detailResult.success) notFound()
    const course = detailResult.data

    if (!course.is_enrolled) {
        redirect(`/learning/${course.slug}`)
    }

    const quizResult = await getQuizForAttempt(course.id)

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href={`/learning/${course.slug}`} className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
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
                <QuizForm courseId={course.id} courseSlug={course.slug} questions={quizResult.data} />
            )}
        </div>
    )
}
