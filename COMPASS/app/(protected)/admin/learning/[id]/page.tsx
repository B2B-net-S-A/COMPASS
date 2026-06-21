import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldCheck, BookOpen, ListChecks, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MarkdownView } from '@/components/learning/MarkdownView'
import { AdminReviewActions } from '@/components/learning/AdminReviewActions'
import {
    getCourseDetail,
    getCourseLessons,
    getCourseQuizForAuthor,
} from '@/lib/actions/courses'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { id: string }
}

export default async function AdminCourseReviewPage({ params }: PageProps) {
    const detailResult = await getCourseDetail(params.id)
    if (!detailResult.success) notFound()
    const course = detailResult.data
    const lessonsResult = await getCourseLessons(course.id)
    const quizResult = await getCourseQuizForAuthor(course.id)

    const lessons = lessonsResult.success ? lessonsResult.data : []
    const quiz = quizResult.success ? quizResult.data : []

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
                        W moderacji
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

            {course.description && (
                <Card className="bg-muted border-border">
                    <CardContent className="p-5">
                        <p className="text-sm">{course.description}</p>
                        {course.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                                {course.tags.map((t) => (
                                    <Badge key={t} className="bg-muted text-muted-foreground border-0 text-[10px]">{t}</Badge>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Action panel */}
            <AdminReviewActions courseId={course.id} title={course.title} />

            {/* Lessons preview */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Lekcje ({lessons.length})</h2>
                </div>
                <div className="space-y-3">
                    {lessons.map((lesson, idx) => (
                        <Card key={lesson.id} className="bg-muted border-border">
                            <CardContent className="p-5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">{idx + 1}</Badge>
                                    <h3 className="font-semibold">{lesson.title}</h3>
                                    {lesson.estimated_minutes && (
                                        <Badge variant="outline" className="text-[9px] border-border">
                                            {lesson.estimated_minutes} min
                                        </Badge>
                                    )}
                                </div>
                                {lesson.video_url && (
                                    <p className="text-xs text-muted-foreground">
                                        Wideo: <a href={lesson.video_url} target="_blank" rel="noreferrer" className="text-primary underline">{lesson.video_url}</a>
                                    </p>
                                )}
                                {lesson.attachments.length > 0 && (
                                    <p className="text-xs text-muted-foreground">{lesson.attachments.length} załącznik(ów) PDF</p>
                                )}
                                {lesson.content_md && (
                                    <div className="pt-2 border-t border-border">
                                        <MarkdownView content={lesson.content_md} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                    {lessons.length === 0 && (
                        <Card className="bg-destructive/5 border-destructive/20">
                            <CardContent className="p-4 text-sm text-destructive">
                                Brak lekcji — kurs nie powinien być w kolejce moderacji.
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Quiz preview */}
            <div>
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
            </div>
        </div>
    )
}
