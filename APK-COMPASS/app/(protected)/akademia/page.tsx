import Link from 'next/link'
import { GraduationCap, Plus, Star, Users, BookOpen, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listPublishedCourses } from '@/lib/actions/courses'

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

function formatRating(rating: number, count: number): string {
    if (count === 0) return 'Brak ocen'
    return `★ ${rating.toFixed(1)} (${count})`
}

export default async function AkademiaPage() {
    const result = await listPublishedCourses({ orderBy: 'newest', limit: 24 })
    const items = result.success ? result.data.items : []
    const total = result.success ? result.data.total : 0

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <GraduationCap className="w-8 h-8 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Akademia</h1>
                    </div>
                    <p className="text-muted-foreground max-w-2xl">
                        Szkolenia tworzone przez konsultantów dla konsultantów. Ucz się, dziel wiedzą,
                        zbieraj punkty lojalnościowe za każdego ucznia, który ukończy Twoje szkolenie.
                    </p>
                </div>
                <Link href="/akademia/tworze/nowy">
                    <Button size="lg" className="gap-2">
                        <Plus className="w-4 h-4" /> Stwórz szkolenie
                    </Button>
                </Link>
            </div>

            {/* Sub-navigation */}
            <div className="flex flex-wrap gap-2">
                <Button variant="default" size="sm" className="gap-2">
                    <BookOpen className="w-4 h-4" /> Katalog
                </Button>
                <Link href="/akademia/moje">
                    <Button variant="outline" size="sm" className="gap-2">
                        <Users className="w-4 h-4" /> Moje szkolenia
                    </Button>
                </Link>
                <Link href="/akademia/tworze">
                    <Button variant="outline" size="sm" className="gap-2">
                        <Pencil className="w-4 h-4" /> Tworzę
                    </Button>
                </Link>
            </div>

            {/* Catalog state */}
            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-6">
                        <p className="text-sm text-red-400">Błąd ładowania katalogu: {result.error}</p>
                    </CardContent>
                </Card>
            )}

            {result.success && items.length === 0 && (
                <Card className="bg-gradient-to-br from-burgundy/10 to-primary/10 border-burgundy/20">
                    <CardContent className="p-12 text-center space-y-4">
                        <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
                            <GraduationCap className="w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold">Katalog jest jeszcze pusty</h2>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            Bądź pierwszą osobą, która podzieli się wiedzą! Stwórz szkolenie,
                            opublikuj je i zarabiaj punkty lojalnościowe.
                        </p>
                        <div className="flex justify-center gap-3 pt-2">
                            <Link href="/akademia/tworze/nowy">
                                <Button size="lg" className="gap-2">
                                    <Plus className="w-4 h-4" /> Stwórz pierwsze szkolenie
                                </Button>
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-6 max-w-2xl mx-auto text-left">
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-xs font-semibold text-primary mb-1">+100 pkt</p>
                                <p className="text-xs text-muted-foreground">
                                    jednorazowo za pierwsze opublikowane szkolenie
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-xs font-semibold text-primary mb-1">+50 pkt × ★</p>
                                <p className="text-xs text-muted-foreground">
                                    za każdego konsultanta, który ukończy Twój kurs
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-xs font-semibold text-primary mb-1">+20 pkt</p>
                                <p className="text-xs text-muted-foreground">
                                    za każde ukończone szkolenie (quiz ≥70%)
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {result.success && items.length > 0 && (
                <>
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Znaleziono <strong className="text-foreground">{total}</strong> szkoleń
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map((c) => (
                            <Link key={c.id} href={`/akademia/${c.slug}`} className="block group">
                                <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors h-full">
                                    <CardContent className="p-5 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <Badge variant="outline" className="text-[10px]">
                                                {c.category}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px] border-white/10">
                                                {LEVEL_LABEL[c.level] ?? c.level}
                                            </Badge>
                                        </div>
                                        <h3 className="font-bold text-base group-hover:text-primary transition-colors line-clamp-2">
                                            {c.title}
                                        </h3>
                                        {c.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-3">
                                                {c.description}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-1">
                                            {c.tags.slice(0, 4).map((t) => (
                                                <Badge
                                                    key={t}
                                                    className="bg-white/5 text-muted-foreground border-0 text-[9px] h-4 px-1"
                                                >
                                                    {t}
                                                </Badge>
                                            ))}
                                            {c.tags.length > 4 && (
                                                <Badge className="bg-white/5 text-muted-foreground border-0 text-[9px] h-4 px-1">
                                                    +{c.tags.length - 4}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-white/5">
                                            <span className="inline-flex items-center gap-1">
                                                <Star className="w-3 h-3 text-amber-400" />
                                                {formatRating(c.avg_rating, c.ratings_count)}
                                            </span>
                                            <span>{formatDuration(c.duration_minutes)}</span>
                                            <span className="inline-flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {c.enrollments_count}
                                            </span>
                                        </div>
                                        {c.author_name && (
                                            <p className="text-[10px] text-muted-foreground">
                                                Autor: {c.author_name}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
