import Link from 'next/link'
import { BookOpen, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listArticlesByCategory } from '@/lib/actions/support-articles'

export const dynamic = 'force-dynamic'

export default async function AdminKbPage() {
    const result = await listArticlesByCategory(undefined, { onlyPublished: false })
    const articles = result.success ? result.data : []

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/admin/support" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Kolejka ticketów
                    </Link>
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Edytor bazy wiedzy</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">Artykuły publikowane w /support/kb.</p>
                </div>
                <Link href="/admin/support/kb/new">
                    <Button className="gap-2">
                        <Plus className="w-4 h-4" /> Nowy artykuł
                    </Button>
                </Link>
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && articles.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center space-y-3">
                        <BookOpen className="w-16 h-16 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">Brak artykułów. Dodaj pierwszy.</p>
                    </CardContent>
                </Card>
            )}

            {articles.length > 0 && (
                <div className="space-y-2">
                    {articles.map((a) => (
                        <Link key={a.id} href={`/admin/support/kb/${a.slug}/edit`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <Badge variant="outline" className="text-[10px]">{a.category_name_pl}</Badge>
                                                {a.published_at ? (
                                                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                                                        Opublikowane
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                                                        Wersja robocza
                                                    </Badge>
                                                )}
                                            </div>
                                            <h3 className="font-semibold group-hover:text-primary">{a.title}</h3>
                                            {a.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.excerpt}</p>}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
