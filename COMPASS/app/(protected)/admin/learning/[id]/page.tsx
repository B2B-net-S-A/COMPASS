import { canReviewCourseVersion } from '@/lib/actions/courses-admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldCheck, ListChecks, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CourseLearnerPreview } from '@/components/academy/CourseLearnerPreview'
import { AcademyReviewHistory } from '@/components/academy/AcademyReviewHistory'
import { AdminReviewActions } from '@/components/learning/AdminReviewActions'
import {
    getCourseDetail,
    getCourseLessons,
    getCourseQuizForAuthor,
} from '@/lib/actions/courses'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { id: string }
    searchParams: { legacy?: string }
}

export default async function AdminCourseReviewPage({ params, searchParams }: PageProps) {
    const legacy = searchParams.legacy === '1'
    const options = legacy ? { publishedOnly: true } : { author: true }
    const detailResult = await getCourseDetail(params.id, options)
    if (!detailResult.success) notFound()
    const course = detailResult.data
    const lessonsResult = await getCourseLessons(course.id, options)
    const quizResult = await getCourseQuizForAuthor(course.id, { publishedOnly: legacy })

    const permission = await canReviewCourseVersion(course.version_id!)
    const lessons = lessonsResult.success ? lessonsResult.data : []
    const quiz = quizResult.success ? quizResult.data : []
    const previewLoaded = lessonsResult.success && quizResult.success && permission.success && (legacy || !!course.submission_id)

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div>
                <Link href="/admin/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Kolejka moderacji
                </Link>
                <div className="flex items-center gap-3 mb-2">
                    <ShieldCheck className="w-7 h-7 text-primary" />
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{course.title}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="outline" className="border-warning/30 text-warning bg-warning/10 text-[10px]">
                        {legacy ? 'Historyczna publikacja' : 'W moderacji'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{course.category}</Badge>
                    <Badge variant="outline" className="text-[10px] border-border">{course.level}</Badge>
                    {course.duration_minutes && (
                        <Badge variant="outline" className="text-[10px] border-border">
                            <Clock className="w-3 h-3 mr-1" />
                            {course.duration_minutes} min
                        </Badge>
                    )}
                </div>
                {course.author_name && (
                    <p className="text-sm text-muted-foreground mt-2">Autor: <strong>{course.author_name}</strong></p>
                )}
            </div>

            {previewLoaded ? <>
                <AdminReviewActions legacyReview={legacy} canReview={course.status !== 'archived' && permission.success && permission.data} versionId={course.version_id!} submissionId={course.submission_id} courseId={course.id} title={course.title} />
                <CourseLearnerPreview mode="review" course={course} lessons={lessons} quiz={[]} />
            </> : <Card className="border-destructive/30 bg-destructive/5"><CardContent className="space-y-2 p-5" role="alert">
                <p className="font-semibold">Nie udało się wczytać kompletnego podglądu.</p>
                <p className="text-sm">Decyzja jest zablokowana, dopóki nie odczytamy programu, materiałów, quizu i uprawnień moderatora.</p>
                <Link href={`/admin/learning/${course.id}${legacy ? '?legacy=1' : ''}`} className="inline-flex text-sm font-medium text-primary underline">Odśwież podgląd</Link>
            </CardContent></Card>}

            {/* Answer key is scoped to an authorized reviewer. */}
            {previewLoaded && <div>
                <div className="flex items-center gap-2 mb-3">
                    <ListChecks className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Quiz ({quiz.length} pytań)</h2>
                </div>
                <div className="space-y-3">
                    {quiz.map((q, idx) => (
                        <Card key={q.id} className="bg-muted border-border">
                            <CardContent className="p-4 space-y-2">
                                <div className="flex items-start gap-2">
                                    <Badge variant="outline" className="text-[10px] mt-0.5">{idx + 1}</Badge>
                                    <p className="font-medium text-sm flex-1">{q.question_text}</p>
                                </div>
                                <div className="pl-7 space-y-1">
                                    {q.options.map((o) => (
                                        <div
                                            key={o.id}
                                            className={`p-2 rounded text-xs ${
                                                o.is_correct
                                                    ? 'bg-success/10 border border-success/30 text-success'
                                                    : 'bg-muted border border-border text-muted-foreground'
                                            }`}
                                        >
                                            {String.fromCharCode(65 + o.order_index)}. {o.option_text}
                                            {o.is_correct && ' ✓ poprawna'}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>}
            <AcademyReviewHistory courseId={course.id} refreshKey={`${course.updated_at}-${course.submission_id ?? ''}`} />
        </div>
    )
}
