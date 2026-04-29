import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GraduationCap, BookOpen, Star, Clock, Users, CheckCircle2, ListChecks } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CourseDetailActions } from '@/components/akademia/CourseDetailActions'
import { getCourseDetail } from '@/lib/actions/courses'

export const dynamic = 'force-dynamic'

const LEVEL_LABEL: Record<string, string> = {
    beginner: 'Podstawowy',
    intermediate: 'Średni',
    advanced: 'Zaawansowany',
}

function formatDuration(min: number | null): string {
    if (!min) return '—'
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m === 0 ? `${h}h` : `${h}h ${m}min`
}

interface PageProps {
    params: { slug: string }
}

export default async function CourseDetailPage({ params }: PageProps) {
    const result = await getCourseDetail(params.slug)
    if (!result.success) notFound()
    const course = result.data

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <Link href="/akademia" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                ← Katalog
            </Link>

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{course.category}</Badge>
                    <Badge variant="outline" className="text-[10px] border-white/10">{LEVEL_LABEL[course.level] ?? course.level}</Badge>
                    {course.duration_minutes && (
                        <Badge variant="outline" className="text-[10px] border-white/10 gap-1">
                            <Clock className="w-3 h-3" /> {formatDuration(course.duration_minutes)}
                        </Badge>
                    )}
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
                    <GraduationCap className="w-8 h-8 text-primary shrink-0" />
                    {course.title}
                </h1>
                {course.description && <p className="text-muted-foreground">{course.description}</p>}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        {course.ratings_count > 0 ? `${course.avg_rating.toFixed(1)} (${course.ratings_count} ocen)` : 'Brak ocen'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {course.enrollments_count} zapisów · {course.completions_count} ukończeń
                    </span>
                    {course.author_name && <span>Autor: <strong className="text-foreground">{course.author_name}</strong></span>}
                </div>
                {course.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {course.tags.map((t) => (
                            <Badge key={t} className="bg-white/5 text-muted-foreground border-0 text-[10px]">{t}</Badge>
                        ))}
                    </div>
                )}
            </div>

            <CourseDetailActions
                courseId={course.id}
                courseSlug={course.slug}
                isEnrolled={course.is_enrolled}
                hasLessons={course.lessons.length > 0}
                hasQuiz={course.quiz_questions_count > 0}
            />

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-primary" />
                        <h2 className="text-xl font-semibold">Lekcje ({course.lessons.length})</h2>
                    </div>
                    {course.lessons.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Kurs nie ma jeszcze lekcji.</p>
                    ) : (
                        <ol className="space-y-2">
                            {course.lessons.map((l, idx) => (
                                <li
                                    key={l.id}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10"
                                >
                                    <Badge variant="outline" className="text-[10px] w-7 justify-center">
                                        {idx + 1}
                                    </Badge>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{l.title}</p>
                                        {l.estimated_minutes && (
                                            <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                                                <Clock className="w-3 h-3" /> {l.estimated_minutes} min
                                                {l.video_url && ' · wideo'}
                                                {l.attachments.length > 0 && ` · ${l.attachments.length} PDF`}
                                            </p>
                                        )}
                                    </div>
                                    {course.is_enrolled && (
                                        <Link href={`/akademia/${course.slug}/lekcja/${l.id}`}>
                                            <Badge variant="outline" className="text-[10px] hover:bg-primary/20 cursor-pointer">
                                                Otwórz
                                            </Badge>
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-2">
                    <div className="flex items-center gap-2">
                        <ListChecks className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold">Quiz końcowy</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {course.quiz_questions_count} pytań ABCD · próg zaliczenia 70% · za zdanie otrzymujesz{' '}
                        <strong className="text-primary">+20 pkt</strong>
                    </p>
                </CardContent>
            </Card>

            {course.user_rating && (
                <Card className="bg-amber-500/5 border-amber-500/20">
                    <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground mb-2">Twoja ocena:</p>
                        <div className="flex items-center gap-1 mb-2">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <Star
                                    key={n}
                                    className={`w-5 h-5 ${
                                        n <= course.user_rating!.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
                                    }`}
                                />
                            ))}
                        </div>
                        {course.user_rating.comment && <p className="text-sm italic">&quot;{course.user_rating.comment}&quot;</p>}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
