import Link from 'next/link'
import { ShieldCheck, Clock, BookOpen, Plus, Building2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getReviewQueue } from '@/lib/actions/courses-admin'

export const dynamic = 'force-dynamic'

export default async function AdminAkademiaPage() {
    const result = await getReviewQueue()
    const items = result.success ? result.data : []
    const error = !result.success ? result.error : null

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/learning" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Akademia
                    </Link>
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Akademia — moderacja</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">
                        Kolejka kursów konsultanckich oczekujących zatwierdzenia + tworzenie kursów firmowych B2Bnetwork.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-base py-1.5 px-3">
                        {items.length} oczekujących
                    </Badge>
                    <Link href="/learning/tworze/nowy?type=company">
                        <Button size="sm" className="gap-2">
                            <Plus className="w-4 h-4" /> Stwórz kurs firmowy
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Quick links to filtered catalog (Phase 1.4) */}
            <div className="flex flex-wrap gap-2">
                <Link href="/learning?type=company">
                    <Button variant="outline" size="sm" className="gap-2">
                        <Building2 className="w-4 h-4" /> Wszystkie firmowe
                    </Button>
                </Link>
                <Link href="/learning?type=consultant">
                    <Button variant="outline" size="sm" className="gap-2">
                        <BookOpen className="w-4 h-4" /> Wszystkie konsultanckie
                    </Button>
                </Link>
            </div>

            {error && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
                </Card>
            )}

            {!error && items.length === 0 && (
                <Card className="bg-card border-border">
                    <CardContent className="p-12 text-center space-y-3">
                        <ShieldCheck className="w-16 h-16 text-muted-foreground mx-auto" />
                        <h2 className="text-xl font-bold">Brak szkoleń do moderacji</h2>
                        <p className="text-muted-foreground">Kolejka jest pusta. Wróć później albo stwórz kurs firmowy.</p>
                    </CardContent>
                </Card>
            )}

            {items.length > 0 && (
                <div className="space-y-3">
                    {items.map((c) => (
                        <Card key={c.id} className="bg-card border-border hover:border-warning/40 transition-colors">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <Badge variant="outline" className="border-warning/30 text-warning bg-warning/10 text-[10px]">
                                                W moderacji
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">
                                                {c.category}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px] border-border">
                                                {c.level}
                                            </Badge>
                                        </div>
                                        <h3 className="font-bold text-lg mb-1">{c.title}</h3>
                                        {c.description && (
                                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{c.description}</p>
                                        )}
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {c.tags.slice(0, 6).map((t) => (
                                                <Badge key={t} className="bg-muted text-muted-foreground border-0 text-[9px] h-4 px-1">
                                                    {t}
                                                </Badge>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Wysłane: {new Date(c.updated_at).toLocaleString('pl-PL')}
                                            {' · '}
                                            Autor: <strong>{c.author_name ?? 'Nieznany'}</strong>
                                        </p>
                                    </div>
                                    <Link href={`/admin/learning/${c.id}`}>
                                        <Button size="sm" className="gap-2">
                                            <BookOpen className="w-3.5 h-3.5" /> Otwórz do oceny
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
