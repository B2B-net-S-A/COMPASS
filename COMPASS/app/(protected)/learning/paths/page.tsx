import Link from 'next/link'
import { ArrowLeft, ArrowRight, Map, BookOpen, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listLearningPaths } from '@/lib/actions/learning-paths'

export const dynamic = 'force-dynamic'

const LEVEL_LABEL: Record<string, string> = {
    beginner: 'Podstawowy',
    intermediate: 'Średni',
    advanced: 'Zaawansowany',
}

export default async function LearningPathsPage() {
    const result = await listLearningPaths()
    const paths = result.success ? result.data : []
    const error = !result.success ? result.error : null

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div>
                <Link href="/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    <ArrowLeft className="w-4 h-4" /> Akademia
                </Link>
                <div className="flex items-center gap-3">
                    <Map className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Ścieżki kariery</h1>
                </div>
                <p className="text-muted-foreground mt-1">
                    Sekwencje kursów ułożone tematycznie. Ukończ wszystkie kursy w ścieżce żeby uzyskać kompetencję.
                </p>
            </div>

            {error && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            {paths.length === 0 && !error && (
                <Card className="bg-muted border-border">
                    <CardContent className="p-12 text-center space-y-3">
                        <Map className="w-16 h-16 text-muted-foreground mx-auto" />
                        <h2 className="text-xl font-bold">Brak opublikowanych ścieżek</h2>
                        <p className="text-muted-foreground">Zapraszamy wkrótce!</p>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {paths.map((p) => (
                    <Link key={p.id} href={`/learning/paths/${p.slug}`}>
                        <Card className="bg-muted border-border hover:border-primary/40 transition-colors h-full">
                            <CardContent className="p-5 space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-[10px]">{LEVEL_LABEL[p.level]}</Badge>
                                    {p.is_enrolled && (
                                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/10">
                                            Zapisany
                                        </Badge>
                                    )}
                                </div>

                                <h3 className="font-bold text-lg">{p.title}</h3>
                                {p.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                                )}

                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                        <BookOpen className="w-3 h-3" /> {p.course_count} kurs{p.course_count === 1 ? '' : 'y/-ów'}
                                    </span>
                                    {p.estimated_hours && (
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> ~{p.estimated_hours}h
                                        </span>
                                    )}
                                    <span className="ml-auto">{p.enrollments_count} zapisów</span>
                                </div>

                                {p.is_enrolled && p.progress_percent > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                            <span>Postęp</span>
                                            <span>{p.progress_percent}%</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${p.progress_percent}%` }} />
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center text-primary text-sm font-medium pt-1">
                                    {p.is_enrolled ? 'Kontynuuj' : 'Zobacz szczegóły'}
                                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    )
}
