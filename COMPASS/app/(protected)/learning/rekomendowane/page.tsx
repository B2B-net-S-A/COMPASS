import Link from 'next/link'
import { Sparkles, Star, Users, Clock, Brain, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getRecommendedCourses } from '@/lib/actions/course-learning'

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

export default async function RecommendedPage() {
    const result = await getRecommendedCourses()
    const items = result.success ? result.data.items : []
    const basedOnGaps = result.success && result.data.basedOnGaps
    const error = !result.success ? result.error : null

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <div>
                <Link href="/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Akademia
                </Link>
                <div className="flex items-center gap-3">
                    <Sparkles className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Rekomendowane dla Ciebie</h1>
                </div>
                <p className="text-muted-foreground mt-1">
                    {basedOnGaps
                        ? 'Szkolenia dopasowane do Twoich braków w umiejętnościach (na bazie analizy projektów ze Strefy Rozwoju).'
                        : 'Najpopularniejsze i najlepiej oceniane szkolenia w Akademii.'}
                </p>
            </div>

            {basedOnGaps && (
                <Card className="bg-gradient-to-r from-burgundy/10 to-primary/10 border-burgundy/20">
                    <CardContent className="p-4 flex items-start gap-3">
                        <Brain className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium mb-1">Dlaczego te kursy?</p>
                            <p className="text-xs text-muted-foreground">
                                Algorytm porównał Twoje skille z wymaganiami Top {result.success ? items.length : 0} projektów w bazie
                                i wybrał szkolenia, których tagi pokrywają największą liczbę Twoich luk kompetencyjnych.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {error && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            {!error && items.length === 0 && (
                <Card className="bg-card border-border">
                    <CardContent className="p-12 text-center space-y-3">
                        <Sparkles className="w-16 h-16 text-muted-foreground mx-auto" />
                        <h2 className="text-xl font-bold">Brak rekomendacji na razie</h2>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            Kiedy w katalogu pojawią się szkolenia pasujące do Twoich braków, zobaczysz je tutaj.
                            W międzyczasie sprawdź pełen katalog.
                        </p>
                        <Link href="/learning">
                            <Button size="lg" className="gap-2">
                                Przeglądaj katalog <ArrowRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            {items.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((rec) => {
                        const c = rec.course
                        return (
                            <Link key={c.id} href={`/learning/${c.slug}`} className="block group">
                                <Card className="bg-card border-border hover:border-primary/40 transition-colors h-full">
                                    <CardContent className="p-5 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <Badge variant="outline" className="text-[10px]">{c.category}</Badge>
                                            <Badge variant="outline" className="text-[10px] border-border">
                                                {LEVEL_LABEL[c.level] ?? c.level}
                                            </Badge>
                                        </div>
                                        <h3 className="font-bold text-base group-hover:text-primary transition-colors line-clamp-2">
                                            {c.title}
                                        </h3>
                                        {c.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                                        )}

                                        {/* Reason banner */}
                                        <div className="p-2 rounded bg-primary/10 border border-primary/20 text-[11px] text-primary flex items-start gap-1.5">
                                            <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                                            <span>{rec.reason}</span>
                                        </div>

                                        <div className="flex flex-wrap gap-1">
                                            {c.tags.slice(0, 4).map((t) => (
                                                <Badge key={t} className="bg-muted text-muted-foreground border-0 text-[9px] h-4 px-1">
                                                    {t}
                                                </Badge>
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                                            <span className="inline-flex items-center gap-1">
                                                <Star className="w-3 h-3 text-warning" />
                                                {c.ratings_count > 0 ? c.avg_rating.toFixed(1) : '—'}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDuration(c.duration_minutes)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {c.enrollments_count}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
