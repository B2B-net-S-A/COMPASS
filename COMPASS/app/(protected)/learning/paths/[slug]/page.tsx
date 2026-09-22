import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, Clock, CheckCircle2, Lock, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getLearningPathDetail } from '@/lib/actions/learning-paths'
import { LearningPathEnrollButton } from '@/components/learning/LearningPathEnrollButton'
import { LearningPathCompletion } from '@/components/academy/LearningPathCompletion'
import { academyCourseHref } from '@/lib/academy/navigation'

export const dynamic = 'force-dynamic'

const LEVEL_LABEL: Record<string, string> = {
    beginner: 'Podstawowy',
    intermediate: 'Średni',
    advanced: 'Zaawansowany',
}

export default async function LearningPathDetailPage({ params }: { params: { slug: string } }) {
    const result = await getLearningPathDetail(params.slug)
    if (!result.success || !result.data) notFound()
    const path = result.data

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <Link href="/learning/paths" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Wszystkie ścieżki
            </Link>

            <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/20">
                <CardContent className="p-6 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{LEVEL_LABEL[path.level]}</Badge>
                        {path.completed_at && (
                            <Badge variant="outline" className="text-[10px] border-success/30 text-success bg-success/10">
                                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                Ukończona
                            </Badge>
                        )}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">{path.title}</h1>
                    {path.description && <p className="text-muted-foreground">{path.description}</p>}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <BookOpen className="w-4 h-4" /> Obowiązkowe szkolenia: {path.total_courses_count}
                        </span>
                        {path.estimated_hours && (
                            <span className="inline-flex items-center gap-1">
                                <Clock className="w-4 h-4" /> ~{path.estimated_hours}h łącznie
                            </span>
                        )}
                    </div>

                    {path.is_enrolled_in_path ? (
                        <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground">Obowiązkowy program zachowujemy zgodnie z Twoim zapisem na ścieżkę.</p>
                            <div className="flex items-center justify-between text-sm">
                                <span>Postęp ścieżki</span>
                                <span className="font-mono tabular-nums">
                                    {path.completed_courses_count}/{path.total_courses_count} · {path.progress_percent}%
                                </span>
                            </div>
                            {!path.completed_at && <LearningPathCompletion pathId={path.id} />}
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full bg-primary transition-all" style={{ width: `${path.progress_percent}%` }} />
                            </div>
                        </div>
                    ) : (
                        <LearningPathEnrollButton pathId={path.id} />
                    )}
                </CardContent>
            </Card>

            <div className="space-y-3">
                <h2 className="text-lg font-semibold">Kursy w ścieżce</h2>
                {path.courses.map((c, idx) => {
                    const isCompleted = c.is_completed
                    // A2.1: kolejny kurs gated jeśli poprzedni nie completed (sequential learning)
                    const prevCompleted = path.courses.slice(0, idx).filter(previous => previous.is_required).every(previous => previous.is_completed)
                    const isLocked = !prevCompleted && !isCompleted && c.is_required
                    return (
                        <Card
                            key={c.course_id}
                            className={
                                isCompleted
                                    ? 'bg-success/5 border-success/20'
                                    : isLocked
                                      ? 'bg-card border-border opacity-60'
                                      : 'bg-card border-border hover:border-primary/30 transition-colors'
                            }
                        >
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold">
                                    {isCompleted ? (
                                        <CheckCircle2 className="w-5 h-5 text-success" />
                                    ) : isLocked ? (
                                        <Lock className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        idx + 1
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold">{c.course?.title ?? 'Szkolenie chwilowo niedostępne'}</p>
                                    {!c.course && <p className="text-xs text-muted-foreground">To wymaganie pozostaje w Twoim programie. Skontaktuj się z administratorem.</p>}
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                        {c.course && <Badge variant="outline" className="text-[10px]">{c.course.category}</Badge>}
                                        {!c.is_required && (
                                            <Badge variant="outline" className="text-[10px] border-border">Opcjonalny</Badge>
                                        )}
                                        {c.is_enrolled && !c.is_completed && (
                                            <Badge variant="outline" className="text-[10px] border-warning/30 text-warning bg-warning/10">
                                                W trakcie
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                {!c.course ? <span className="text-xs text-muted-foreground">Niedostępne</span> : isLocked ? (
                                    <span className="text-xs text-muted-foreground">Ukończ poprzedni kurs</span>
                                ) : (
                                    <Link
                                        href={c.run_id ? `/learning/edycje/${c.run_id}` : academyCourseHref(c.course.slug, c.enrollment_id)}
                                        className="text-sm text-primary inline-flex items-center gap-1"
                                    >
                                        {isCompleted ? 'Powtórz' : c.is_enrolled ? 'Kontynuuj' : 'Otwórz'}
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </Link>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
