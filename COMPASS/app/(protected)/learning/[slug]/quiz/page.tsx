import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { QuizForm } from '@/components/learning/QuizForm'
import { QuizSessionForm } from '@/components/learning/QuizSessionForm'
import { QuizStartCard } from '@/components/learning/QuizStartCard'
import { Card, CardContent } from '@/components/ui/card'
import { getCourseDetail } from '@/lib/actions/courses'
import { getQuizForAttempt, getQuizStatus, startQuizAttempt } from '@/lib/actions/course-learning'
import { academyCourseHref } from '@/lib/academy/navigation'
import type { Course } from '@/lib/types/learning'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { slug: string }
    searchParams: { enrollment?: string; kind?: string }
}

function ErrorCard({ message }: { message: string }) {
    return <Card className="border-destructive/20 bg-destructive/5"><CardContent className="p-4 text-sm text-destructive">{message}</CardContent></Card>
}

/** Dotychczasowy quiz, dopóki migracja sesji podejścia nie jest zastosowana. */
async function LegacyQuiz({ course, enrollmentId }: { course: Course & { slug: string }; enrollmentId: string }) {
    const quizResult = await getQuizForAttempt(course.id, enrollmentId)
    if (!quizResult.success) return <ErrorCard message={quizResult.error} />
    if (quizResult.data.length === 0) return <Card className="border-warning/20 bg-warning/5"><CardContent className="p-6 text-sm text-warning">Quiz nie ma jeszcze pytań.</CardContent></Card>
    return <QuizForm key={enrollmentId} courseId={course.id} courseSlug={course.slug} enrollmentId={enrollmentId} passPercent={course.completion_rules?.quiz_pass_percent ?? 70} attemptLimit={course.quiz_attempt_limit} attemptWindowHours={course.quiz_attempt_window_hours} questions={quizResult.data} />
}

async function QuizBody({ course, enrollmentId, kind }: { course: Course & { slug: string }; enrollmentId: string; kind: 'final' | 'pre' }) {
    const status = await getQuizStatus(course.id, enrollmentId)
    if (!status.success) return <ErrorCard message={status.error} />
    if (status.data === null) return <LegacyQuiz course={course} enrollmentId={enrollmentId} />
    const open = kind === 'pre' ? status.data.open_pre : status.data.open_final
    if (!open) return <>
        <QuizStartCard courseId={course.id} enrollmentId={enrollmentId} status={status.data} kind={kind} />
        {kind === 'final' && !status.data.pre_blocker && <Link href={`/learning/${course.slug}/quiz?kind=pre&enrollment=${enrollmentId}`} className="inline-block text-sm text-primary underline">Najpierw rozwiąż test wstępny</Link>}
    </>
    // Start jest idempotentny: przy otwartej próbie oddaje ten sam zestaw, kolejność i czas.
    const session = await startQuizAttempt(course.id, enrollmentId, kind)
    if (!session.success) return <ErrorCard message={session.error} />
    return <QuizSessionForm key={session.data.attempt_id} session={session.data} courseSlug={course.slug} enrollmentId={enrollmentId} />
}

export default async function QuizPage({ params, searchParams }: PageProps) {
    const detailResult = await getCourseDetail(params.slug, { enrollmentId: searchParams.enrollment })
    if (!detailResult.success) notFound()
    const course = detailResult.data
    if (!course.enrollment_id) redirect(`/learning/${course.slug}`)
    const kind = searchParams.kind === 'pre' ? 'pre' : 'final'

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 md:p-8">
            <div>
                <Link href={academyCourseHref(course.slug, course.enrollment_id)} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                    ← {course.title}
                </Link>
                <div className="flex items-center gap-3">
                    <ListChecks className="size-7 text-primary" aria-hidden="true" />
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{kind === 'pre' ? 'Test wstępny' : 'Test końcowy'}</h1>
                </div>
            </div>
            <QuizBody course={course} enrollmentId={course.enrollment_id} kind={kind} />
        </div>
    )
}
