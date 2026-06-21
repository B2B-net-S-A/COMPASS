import Link from 'next/link'
import { GraduationCap, BookOpen, CheckCircle2, Star, ArrowRight, Award } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getMyEnrollments } from '@/lib/actions/course-learning'

export const dynamic = 'force-dynamic'

const LEVEL_LABEL: Record<string, string> = {
    beginner: 'Podstawowy',
    intermediate: 'Średni',
    advanced: 'Zaawansowany',
}

export default async function MyEnrollmentsPage() {
    const result = await getMyEnrollments()
    const enrollments = result.success ? result.data : []
    const error = !result.success ? result.error : null

    const completed = enrollments.filter((e) => !!e.completed_at)
    const inProgress = enrollments.filter((e) => !e.completed_at)

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div>
                <Link href="/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Akademia
                </Link>
                <div className="flex items-center gap-3">
                    <BookOpen className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Moje szkolenia</h1>
                </div>
                <p className="text-muted-foreground mt-1">Twoje zapisy i postęp na szkoleniach.</p>
            </div>

            {error && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            {!error && enrollments.length === 0 && (
                <Card className="bg-gradient-to-br from-burgundy/10 to-primary/10 border-burgundy/20">
                    <CardContent className="p-12 text-center space-y-3">
                        <GraduationCap className="w-16 h-16 text-primary mx-auto" />
                        <h2 className="text-xl font-bold">Nie zapisałeś się jeszcze na żadne szkolenie</h2>
                        <p className="text-muted-foreground">Przeglądnij katalog i wybierz coś dla siebie.</p>
                        <Link href="/learning">
                            <Button size="lg" className="gap-2">
                                Przeglądaj katalog <ArrowRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            {inProgress.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">W trakcie ({inProgress.length})</h2>
                    {inProgress.map((e) => (
                        <Card key={e.enrollment_id} className="bg-card border-border hover:border-primary/30 transition-colors">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-[10px]">{e.course.category}</Badge>
                                            <Badge variant="outline" className="text-[10px] border-border">
                                                {LEVEL_LABEL[e.course.level] ?? e.course.level}
                                            </Badge>
                                        </div>
                                        <h3 className="font-bold text-lg">{e.course.title}</h3>
                                        <div className="mt-3">
                                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                                <span>Postęp lekcji</span>
                                                <span>{e.completed_lessons.length}/{e.total_lessons} · {e.progress_percent}%</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                <div className="h-full bg-primary transition-all" style={{ width: `${e.progress_percent}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                    <Link href={`/learning/${e.course.slug}/lekcja/${e.last_accessed_lesson_id ?? 'first'}`}>
                                        <Button size="sm" className="gap-2">
                                            Kontynuuj <ArrowRight className="w-3.5 h-3.5" />
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </section>
            )}

            {completed.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-success" /> Ukończone ({completed.length})
                    </h2>
                    {completed.map((e) => (
                        <Card key={e.enrollment_id} className="bg-success/5 border-success/20">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="border-success/30 text-success bg-success/10 text-[10px]">
                                                Ukończone
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">{e.course.category}</Badge>
                                            {e.points_awarded && (
                                                <Badge variant="outline" className="border-warning/30 text-warning bg-warning/10 text-[10px]">
                                                    <Star className="w-2.5 h-2.5 mr-0.5" /> +20 pkt
                                                </Badge>
                                            )}
                                        </div>
                                        <h3 className="font-bold">{e.course.title}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Ukończono: {new Date(e.completed_at!).toLocaleDateString('pl-PL')}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <a href={`/api/akademia/certificate?courseId=${e.course.id}`}>
                                            <Button size="sm" className="gap-2 bg-warning hover:bg-warning/90 text-warning-foreground">
                                                <Award className="w-3.5 h-3.5" />
                                                Certyfikat
                                            </Button>
                                        </a>
                                        <Link href={`/learning/${e.course.slug}`}>
                                            <Button variant="outline" size="sm" className="gap-2">
                                                Zobacz <ArrowRight className="w-3.5 h-3.5" />
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </section>
            )}
        </div>
    )
}
